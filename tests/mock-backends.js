const express = require('express');

// API Service (port 8001)
const apiService = express();
apiService.use('/api', (req, res) => {
  res.json({ 
    service: 'API Service', 
    method: req.method, 
    path: req.path,
    message: 'This is a response from the API service' 
  });
});
apiService.listen(8001, () => console.log('API Service running on port 8001'));

// Web Service (port 8002)
const webService = express();
webService.use('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Web Service</title></head>
      <body>
        <h1>Web Service</h1>
        <p>You accessed: ${req.path}</p>
        <p>This is a response from the Web service</p>
      </body>
    </html>
  `);
});
webService.listen(8002, () => console.log('Web Service running on port 8002'));

// Admin Service (port 8003)
const adminService = express();
adminService.use('/admin', (req, res) => {
  res.json({ 
    service: 'Admin Service', 
    method: req.method, 
    path: req.path,
    message: 'This is a response from the Admin service' 
  });
});
adminService.listen(8003, () => console.log('Admin Service running on port 8003'));

// Static Service (port 8004)
const staticService = express();
staticService.use('/static', express.static('public'));
staticService.use('/static', (req, res) => {
  res.json({ 
    service: 'Static Service', 
    method: req.method, 
    path: req.path,
    message: 'This is a response from the Static service' 
  });
});
staticService.listen(8004, () => console.log('Static Service running on port 8004'));

console.log('All mock backend services are running');