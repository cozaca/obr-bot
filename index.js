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

console.log(`Pre-start logs: token =${process.env.TOKEN}, slacktoken = ${process.env.SLACK_TOKEN}, clientID = ${process.env.CLIENT_ID}`)
if (process.env.TOKEN || process.env.SLACK_TOKEN) {
    //Treat this as a custom integration
    var customIntegration = require('./lib/custom_integrations');
    var token = (process.env.TOKEN) ? process.env.TOKEN : process.env.SLACK_TOKEN;
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

controller.hears('hello', 'direct_message', function (bot, message) {
    bot.reply(message, 'Houdy! How can I help you?');
});

controller.hears([`pls release`,
                  "please release",
                  "could you please release"], 
                   ["direct_message", "message.channels"], function(bot, message) {
                       

    var textMessage = message.text
    var jenkinsKey = new String(message.text).match(/(?<=extension \()(.*?)(?=\s*\))/)[0];
    var projectKey = new String(message.text).match(/(?<=jira \()(.*?)(?=\s*\))/)[0];
    var projectVersion = new String(message.text).match(/(?<=version \()(.*?)(?=\s*\))/)[0];
    var branch = new String(message.text).match(/(?<=branch \()(.*?)(?=\s*\))/)[0];

    var jobName = `${jenkinsKey}-releases`;
    if(process.env.MODE === 'test') {
        jobName = 'obr-test'
    }

    console.info(`JobName = ${jobName}`)

    if(projectKey === null || projectKey === '') {
        projectKey = new String(message.text).match(/(?<=jira key \()(.*?)(?=\s*\))/);
    }
  
   console.info(`message is ${textMessage} \n jenkinsKey = ${jenkinsKey}, projectKey = ${projectKey}, projectVersion = ${projectVersion}, branch = ${branch}`)

   var { http, urlRoute } = triggerJenkinsJob(projectKey, projectVersion, jenkinsKey, branch, jobName);

   http.onreadystatechange=(e)=>{
    console.log(`response text: ${http.responseText}`)
    }
    bot.reply(message, `Sure, release is started. Pls follow the link below from futher information ${urlRoute}. BTW don't worry is in UAT.`);
})

function triggerJenkinsJob(projectKey, projectVersion, jenkinsKey, branch, jobName) {
    const urlRoute = `http://deb-jenkins-prd.ullink.lan/job/${jobName}/`;
    const url = `http://deb-jenkins-prd.ullink.lan/job/${jobName}/buildWithParameters?token=Rbot_trigger&PROJECT_KEY=${projectKey}&PROJECT_VERSION=${projectVersion}&JENKINS_KEY=${jenkinsKey}&JENKINS_BRANCH=${branch}`;
    var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
    var http = new XMLHttpRequest();
    http.open("GET", url);
    http.send();
    console.info(`Triggering the job : ${url}`);
    return { http, urlRoute };
}

