const helmet = require("helmet");
const csurf = require("csurf");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const csfMiddleware = csurf({
  cookie: {
    httpOnly: true,
    sameSite: "lax",
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Muitas tentativas de login, tente novamente depois.",
});

const helmetMiddleware = helmet();

module.exports = {
  csfMiddleware,
  loginLimiter,
  helmetMiddleware,
  cookieParser,
};
