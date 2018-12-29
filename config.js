var config = {};

config.mode = process.env.MODE || 'uat';
config.jobName = 'obr-test';
config.token = 'put your slack token here';

module.exports = config;