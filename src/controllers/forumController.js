const { body, validationResult } = require("express-validator");
const db = require("../config/db");

const forumValidation = [
  body("comment")
    .trim()
    .notEmpty()
    .withMessage("Comment cannot be empty")
    .escape(),
];

const getForumPage = (req, res) => {
  if (!req.session.loggedin) {
    return res.redirect("/");
  }
  db.all(`SELECT username,message FROM public_forum`, (err, rows) => {
    res.render("forum", { rows, csrfToken: req.csrfToken() });
  });
};

const postForumComment = (req, res) => {
  if (!req.session.loggedin) {
    return res.redirect("/");
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return db.all(`SELECT username, message FROM public_forum`, (err, rows) => {
      if (err) {
        console.error("Forum load error:", err);
        return res.send("Error loading forum");
      }
      return res.render("forum", {
        rows,
        error: errors.array()[0].msg,
        csrfToken: req.csrfToken(),
      });
    });
  }
  const comment = req.body.comment;
  const username = req.session.username;
  db.run(
    `INSERT INTO public_forum (username, message) VALUES (?, ?)`,
    [username, comment],
    (err) => {
      if (err) {
        return res.send("Error posting comment");
      }
      db.all(`SELECT username, message FROM public_forum`, (err, rows) => {
        if (err) {
          return res.send("Error loading forum");
        }
        res.render("forum", { rows, csrfToken: req.csrfToken() });
      });
    }
  );
};

module.exports = {
  forumValidation,
  getForumPage,
  postForumComment,
};
