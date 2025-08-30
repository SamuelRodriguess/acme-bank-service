const express = require("express");
const router = express.Router();
const { getHomePage } = require("../controllers/homeController");

router.get("/home", getHomePage);

module.exports = router;
