const express = require("express");
const router = express.Router();
const {
  csfMiddleware,
} = require("../config/middlewares");
const {
  transferValidation,
  getTransferPage,
  postTransfer,
} = require("../controllers/transferController");

router.get("/transfer", csfMiddleware, getTransferPage);
router.post("/transfer", csfMiddleware, transferValidation, postTransfer);

module.exports = router;
