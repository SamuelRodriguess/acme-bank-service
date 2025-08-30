const express = require("express");
const router = express.Router();
const { loginValidation, login } = require("../controllers/authController");
const { loginLimiter } = require("../config/middlewares");

router.post("/auth", loginLimiter, loginValidation, login);

module.exports = router;
