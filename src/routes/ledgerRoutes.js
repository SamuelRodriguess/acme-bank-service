const express = require("express");
const router = express.Router();
const { check } = require("express-validator");
const {
  getLedgerPage,
  ledgerValidation,
} = require("../controllers/ledgerController");

router.get("/public_ledger", ledgerValidation, getLedgerPage);

module.exports = router;
