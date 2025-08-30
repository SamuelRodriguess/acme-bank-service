const express = require("express");
const path = require("path");
const session = require("express-session");
const indexRoutes = require("./routes/indexRoutes");
const authRoutes = require("./routes/authRoutes");
const homeRoutes = require("./routes/homeRoutes");
const transferRoutes = require("./routes/transferRoutes");
const downloadRoutes = require("./routes/downloadRoutes");
const forumRoutes = require("./routes/forumRoutes");
const ledgerRoutes = require("./routes/ledgerRoutes");

const {
  helmetMiddleware,
  cookieParser,
} = require("./config/middlewares");

const app = express();
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "../public")));

app.use(helmetMiddleware);
app.use(cookieParser());

app.use(
  session({
    secret: "secret",
    resave: true,
    saveUninitialized: true,
  })
);

app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));

app.use(indexRoutes);
app.use(homeRoutes);
app.use(authRoutes);
app.use(transferRoutes);
app.use(downloadRoutes);
app.use(forumRoutes);
app.use(ledgerRoutes);

app.use((error, req, res, next) => {
  if (error.code !== "EBADCSRFTOKEN") {
    return next();
  }
  res.status(403).send("The token is invalid");
});

module.exports = app;