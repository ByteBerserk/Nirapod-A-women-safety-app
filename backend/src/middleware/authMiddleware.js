export const protect = (req, res, next) => {
  const userId = req.headers["x-user-id"] || req.body.userId || req.query.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }

  req.user = { _id: userId, id: userId };
  next();
};
