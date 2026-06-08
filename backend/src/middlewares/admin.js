module.exports = function admin(req, res, next) {
  try {
    if (!req.user || !req.user.admin) {
      return res.status(403).json({ ok: false, message: "Admin only" });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};
