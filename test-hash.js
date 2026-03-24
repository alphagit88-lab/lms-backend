const crypto = require("crypto");
const merchantId = "1234287";
const orderId = "12345";
const amount = 1425.00;
const formattedAmount = amount.toFixed(2);
const currency = "LKR";
const merchantSecret = "MjU2NzgxMjM5NTY4OTYxMzM3NjE4NTA2NTg3NTM0MTQwODg4MjUz";

const hashedSecret = crypto.createHash("md5").update(merchantSecret).digest("hex").toUpperCase();
const raw = `${merchantId}${orderId}${formattedAmount}${currency}${hashedSecret}`;

console.log("hashedSecret", hashedSecret);
console.log("raw", raw);
const hash = crypto.createHash("md5").update(raw).digest("hex").toUpperCase();
console.log("Request Hash", hash);
