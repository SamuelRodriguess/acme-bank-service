const { check } = require("express-validator");
const db = require("../config/db");

const ledgerValidation = [
  check("id").optional().isInt().withMessage("id must be an integer"),
];
const getLedgerPage = (req, res) => {
  if (!req.session.loggedin) {
    return res.redirect("/");
  }
  if (req.query.id) {
    return db.all(
      `SELECT * FROM public_ledger WHERE from_account = $id`,
      { $id: req.query.id },
      (err, rows) => {
        if (err) {
          return res.send("Error loading ledger");
        }
        return res.render("ledger", { rows });
      }
    );
  }
  db.all(`SELECT * FROM public_ledger`, (err, rows) => {
    if (err) {
      return res.send("Error loading ledger");
    }
    return res.render("ledger", { rows });
  });
};

module.exports = {
  ledgerValidation,
  getLedgerPage,
};
