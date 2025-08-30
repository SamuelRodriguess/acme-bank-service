const { body, validationResult } = require("express-validator");
const db = require("../config/db");

const transferValidation = [
  body("account_to")
    .exists()
    .withMessage("Recipient account is required")
    .isInt({ gt: 0 })
    .withMessage("Recipient account must be a positive integer"),
  body("amount")
    .exists()
    .withMessage("Amount is required")
    .isFloat({ gt: 0 })
    .withMessage("Amount must be greater than zero"),
];

const getTransferPage = (req, res) => {
  if (!req.session.loggedin) {
    return res.redirect("/");
  }
  res.render("transfer", { sent: "", csrfToken: req.csrfToken() });
};

const postTransfer = (req, res) => {
  if (!req.session.loggedin) {
    return res.redirect("/");
  }
  const balance = req.session.balance;
  const account_to = parseInt(req.body.account_to);
  const amount = parseFloat(req.body.amount);
  const account_from = req.session.account_no;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render("transfer", {
      sent: errors.array()[0].msg,
      csrfToken: req.csrfToken(),
    });
  }

  if (balance <= amount) {
    return res.render("transfer", {
      sent: "You Don't Have Enough Funds.",
      csrfToken: req.csrfToken(),
    });
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    db.run(
      `UPDATE users SET balance = balance - ? WHERE account_no = ?`,
      [amount, account_from],
      (error) => {
        if (error) {
          db.run("ROLLBACK");
          return res.render("transfer", {
            sent: "Error processing transfer.",
            csrfToken: req.csrfToken(),
          });
        }
        db.run(
          `UPDATE users SET balance = balance + ? WHERE account_no = ?`,
          [amount, account_to],
          (error) => {
            if (error) {
              db.run("ROLLBACK");
              return res.render("transfer", {
                sent: "Error processing transfer.",
                csrfToken: req.csrfToken(),
              });
            }
            db.run("COMMIT");
            return res.render("transfer", {
              sent: "Money Transferred",
              csrfToken: req.csrfToken(),
            });
          }
        );
      }
    );
  });
};

module.exports = {
  transferValidation,
  getTransferPage,
  postTransfer,
};
