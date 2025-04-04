const http = require("http");

// Function to make a request
function makeRequest(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: 6000,
      path: path,
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    console.log(`Making ${method} request to ${path}`);

    const req = http.request(options, (res) => {
      console.log(`STATUS: ${res.statusCode}`);
      console.log(`HEADERS: ${JSON.stringify(res.headers)}`);

      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        console.log(`RESPONSE: ${data}`);
        console.log("----------------------------");
        resolve(data);
      });
    });

    req.on("error", (e) => {
      console.error(`Problem with request: ${e.message}`);
      reject(e);
    });

    req.end();
  });
}

// Test various endpoints
async function runTests() {
  try {
    // Should route to API Service
    await makeRequest("/api/users");

    // Should route to Web Service
    await makeRequest("/about");

    // Should route to Admin Service
    await makeRequest("/admin/dashboard");

    // Should route to Static Service
    await makeRequest("/static/styles.css");

    console.log("All test requests completed!");
  } catch (error) {
    console.error("Tests failed:", error);
  }
}

runTests();

