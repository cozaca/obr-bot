/**
 * A Bot for Slack!
 */


/**
 * Define a function for initiating a conversation on installation
 * With custom integrations, we don't have a way to find out who installed us, so we can't message them :(
 */


function onInstallation(bot, installer) {
    if (installer) {
        bot.startPrivateConversation({user: installer}, function (err, convo) {
            if (err) {
                console.log(err);
            } else {
                convo.say('I am a bot that has just joined your team');
                convo.say('You must now /invite me to a channel so that I can be of use!');
            }
        });
    }
}


/**
 * Configure the persistence options
 */

var config = {};
if (process.env.MONGOLAB_URI) {
    var BotkitStorage = require('botkit-storage-mongo');
    config = {
        storage: BotkitStorage({mongoUri: process.env.MONGOLAB_URI}),
    };
} else {
    config = {
        json_file_store: ((process.env.TOKEN)?'./db_slack_bot_ci/':'./db_slack_bot_a/'), //use a different name if an app or CI
    };
}

/**
 * Are being run as an app or a custom integration? The initialization will differ, depending
 */
var config = require('./config');
console.log(`Pre-start logs: token =${config.token}, slacktoken = ${process.env.SLACK_TOKEN}, clientID = ${process.env.CLIENT_ID}`)
if (config.token || process.env.SLACK_TOKEN) {
    //Treat this as a custom integration
    var customIntegration = require('./lib/custom_integrations');
    var token = (config.token) ? config.token : process.env.SLACK_TOKEN;
    var controller = customIntegration.configure(token, config, onInstallation);
} else if (process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.PORT) {
    //Treat this as an app
    var app = require('./lib/apps');
    var controller = app.configure(process.env.PORT, process.env.CLIENT_ID, process.env.CLIENT_SECRET, config, onInstallation);
} else {
    console.log('Error: If this is a custom integration, please specify TOKEN in the environment. If this is an app, please specify CLIENTID, CLIENTSECRET, and PORT in the environment');
    process.exit(1);
}


/**
 * A demonstration for how to handle websocket events. In this case, just log when we have and have not
 * been disconnected from the websocket. In the future, it would be super awesome to be able to specify
 * a reconnect policy, and do reconnections automatically. In the meantime, we aren't going to attempt reconnects,
 * WHICH IS A B0RKED WAY TO HANDLE BEING DISCONNECTED. So we need to fix this.
 *
 * TODO: fixed b0rked reconnect behavior
 */
// Handle events related to the websocket connection to Slack
controller.on('rtm_open', function (bot) {
    console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function (bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
});


/**
 * Core bot logic goes here!
 */
// BEGIN EDITING HERE!

controller.on('bot_channel_join', function (bot, message) {
    bot.reply(message, "I'm here! I'm eager to release something. Pls let me know when you are ready.")
});

controller.hears('hello', ["direct_message", "direct_mention"], function (bot, message) {
    bot.reply(message, 'Houdy! How can I help you?');
});

controller.hears(['pls tell something about you',
                  'pls tell me',
                  'give me some info about OBR',
                  'obr',
                  'what can you do',
                  'help'], ["direct_message", "direct_mention"], function (bot, message) {
    bot.reply(message, 'Houdy! I am the OBR bot. My name is R-bot. I can release whatever extension you want, if you follow two basic steps.\n'+
                        '*1*. Make sure that you have applied obr pipeline to your extension. If you don\'t have that please do so following\n'+
                        '     the steps from this page: https://itivitinet.itiviti.com/pages/viewpage.action?pageId=156109745 \n'+
                        '*2*. If you want to release you can simply tell me what to do by: \n' +
                        '     pls release extension (`your extension`) with version (`version to be released`) as (`release status`) from branch (`branch to be released`) \n'+
                        '     with jira (`product jira key`) and optionally you can skip integration test by typing `ignoring` integration test.\n' +
                        'For example a valid directive for me would be: \n' +
                        '`pls release extension *(ul-middle)* with version *(3.5.7_00)* as *(Internal)* from branch *(3.5.7)* with jira *(MIDL)* ignoring integration test`');
});

controller.hears([`pls release`,
                  "please release",
                  "could you please release",
                  "release"],
                   ["direct_message", "direct_mention"], function(bot, message) {
                       

    var { jenkinsKey,
          projectKey,
          textMessage,
          projectVersion,
          branch,
          aliasRpd,
          releaseProductStatus,
          skipIntegrationTest } = readProperties(message);

    var jobName = `${jenkinsKey}-releases`;
    if(config.mode === 'uat') {
        jobName = config.jobName
    }

    console.info(`JobName = ${jobName}`)

    if(projectKey === null || projectKey === '') {
        projectKey = new String(message.text).match(/(?<=jira key \()(.*?)(?=\s*\))/);
    }

    console.info(`message is ${textMessage} \n jenkinsKey = ${jenkinsKey}, projectKey = ${projectKey}, projectVersion = ${projectVersion}, branch = ${branch}, releaseStatus = ${aliasRpd}`)
    var shouldTriggerJob = projectKey && projectVersion && jenkinsKey && branch && releaseProductStatus;
    if(!shouldTriggerJob)
    {
        var rejectText = `At least one of the following mandatory fields are not provided: *projectKey*, *projectVersion*, *jenkinsKey*, *branch* or *releaseProduct status*.\n Pls make sure that you provide all necessary information`;
        console.info(rejectText);
       bot.reply(message, rejectText);
    } else {
    
        var { http, urlRoute } = triggerJenkinsJob(projectKey, projectVersion, jenkinsKey, branch, jobName, skipIntegrationTest, releaseProductStatus);
     
        var replyMessage = `Sure, release is started. Pls follow the link below from futher information ${urlRoute}`;
        http.onreadystatechange=(e)=>{
         console.log(`response text: ${http.responseText} and status ${http.status==404}`)
         if(http.status == 404 || http.responseText !== '') {
             replyMessage = `Job not found. Pls make sure that your OBR job name was properly configured.`;
           }
         }
        
         if(config.mode === 'uat')
         {
            replyMessage = replyMessage + 'BTW don\'t worry is in UAT.';
         }
         bot.reply(message, replyMessage);
        }
})

function readProperties(message) {
    var textMessage = message.text;
    var jenkinsKeyArray = new String(message.text).match(/(?<=extension \()(.*?)(?=\s*\))/);
    var projectKeyArray = new String(message.text).match(/(?<=jira \()(.*?)(?=\s*\))/);
    var projectVersionArray = new String(message.text).match(/(?<=version \()(.*?)(?=\s*\))/);
    var branchArray = new String(message.text).match(/(?<=branch \()(.*?)(?=\s*\))/);
    var skipIntegrationTest = /ignoring/.test(message.text) || /ignore/.test(message.text) || /skip/.test(message.text) || /skipping/.test(message.test);
    var aliasRpdArray = new String(message.text).match(/(?<=as \()(.*?)(?=\s*\))/);
    var jenkinsKey = jenkinsKeyArray == null || jenkinsKeyArray.length < 1 ? null : jenkinsKeyArray[0];
    var projectKey = projectKeyArray == null || projectKeyArray.length < 1 ? null : projectKeyArray[0];
    var projectVersion = projectVersionArray == null || projectVersionArray.length < 1 ? null : projectVersionArray[0];
    var branch = branchArray == null || branchArray.length < 1 ? null : branchArray[0];
    var aliasRpd = aliasRpdArray == null || aliasRpdArray.length < 1 ? null : aliasRpdArray[0];
    var releaseProductStatus = getReleaseProductStatusByAlias(aliasRpd);
    return { jenkinsKey, projectKey, textMessage, projectVersion, branch, aliasRpd, releaseProductStatus, skipIntegrationTest };
}

function getReleaseProductStatusByAlias(alias) {
    var releaseProductStatuses = new Map();
        releaseProductStatuses.set("internal","INTERNAL_ONLY");
        releaseProductStatuses.set("Internal","INTERNAL_ONLY");
        releaseProductStatuses.set("INTERNAL","INTERNAL_ONLY");
        releaseProductStatuses.set("pilot", 'PILOT');
        releaseProductStatuses.set("Pilot", 'PILOT');
        releaseProductStatuses.set("PILOT", 'PILOT');
        releaseProductStatuses.set("ga candidate", 'GA_Candidate');
        releaseProductStatuses.set("gaCandidate", 'GA_Candidate');
        releaseProductStatuses.set("Ga Candidate", 'GA_Candidate');
        releaseProductStatuses.set("Ga", 'GA_Release');
        releaseProductStatuses.set( "GA", 'GA_Release');
        releaseProductStatuses.set("ga", 'GA_Release');
        releaseProductStatuses.set("Ga Release", 'GA_Release');
        releaseProductStatuses.set("GA_Release", 'GA_Release');
        releaseProductStatuses.set("GA Release", 'GA_Release');
    
    return releaseProductStatuses.get(alias);
}

function triggerJenkinsJob(projectKey, projectVersion, jenkinsKey, branch, jobName, skipIntegrationTest, releaseProductStatus) {

    const urlRoute = `http://deb-jenkins-prd.ullink.lan/job/${jobName}/`;
    const url = `http://deb-jenkins-prd.ullink.lan/job/${jobName}/buildWithParameters?token=Rbot_trigger&PROJECT_KEY=${projectKey}&PROJECT_VERSION=${projectVersion}&JENKINS_KEY=${jenkinsKey}&JENKINS_BRANCH=${branch}&SKIP_INTEGRATION_TESTS=${skipIntegrationTest}&RELEASE_PRODUCT_STATUS=${releaseProductStatus}`;
    var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
    var http = new XMLHttpRequest();
    http.open("GET", url);
    http.send();
    console.info(`Triggering the job : ${url}`);
    return { http, urlRoute };
}

