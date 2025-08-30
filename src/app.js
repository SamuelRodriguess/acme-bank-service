require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const { createClient } = require("redis");
const { RedisStore } = require("connect-redis");

const indexRoutes = require("./routes/indexRoutes");
const authRoutes = require("./routes/authRoutes");
const homeRoutes = require("./routes/homeRoutes");
const transferRoutes = require("./routes/transferRoutes");
const downloadRoutes = require("./routes/downloadRoutes");
const forumRoutes = require("./routes/forumRoutes");
const ledgerRoutes = require("./routes/ledgerRoutes");
const { CSRF_TOKEN_ERROR_CODE } = require("./config/constants");

const { helmetMiddleware, cookieParser } = require("./config/middlewares");

const app = express();

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "../public")));
app.use(helmetMiddleware);
app.use(cookieParser());

const redisClient = createClient({
  legacyMode: true,
  url: process.env.REDIS_PUBLIC_URL,
});
redisClient.connect().catch(console.error);

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET || "seusegredo",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true, maxAge: 3600000 },
  })
);

app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(express.json({ limit: "100kb" }));

app.use(indexRoutes);
app.use(homeRoutes);
app.use(authRoutes);
app.use(transferRoutes);
app.use(downloadRoutes);
app.use(forumRoutes);
app.use(ledgerRoutes);

app.use((error, req, res, next) => {
  if (error.code !== CSRF_TOKEN_ERROR_CODE) {
    return next();
  }
  res.status(403).send("The token is invalid");
});

module.exports = app;
