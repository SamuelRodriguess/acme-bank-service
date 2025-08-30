const express = require("express");
const router = express.Router();
const { csfMiddleware } = require("../config/middlewares");
const {
  getForumPage,
  postForumComment,
  forumValidation,
} = require("../controllers/forumController");

router.get("/public_forum", csfMiddleware, getForumPage);
router.post("/public_forum", csfMiddleware, forumValidation, postForumComment);

module.exports = router;
