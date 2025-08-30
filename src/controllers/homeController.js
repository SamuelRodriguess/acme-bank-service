const getHomePage = (req, res) => {
  if (!req.session.loggedin) {
    return res.redirect("/");
  }
  const balanceUser = {
    username: req.session.username,
    balance: req.session.balance,
  };
  res.render("home_page", balanceUser);
};

module.exports = {
  getHomePage,
};
