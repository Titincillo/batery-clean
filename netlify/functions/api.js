const serverless = require('serverless-http');
const app = require('../../server');

// Wrap Express app with serverless-http for Netlify Lambda execution
module.exports.handler = serverless(app);
