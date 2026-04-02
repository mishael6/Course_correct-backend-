const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  // Get token from header
  const authHeader = req.header('Authorization');
  let token;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7, authHeader.length);
  } else {
    token = req.header('x-auth-token');
  }

  // Check if no token
  if (!token) {
    console.warn(`⚠ Auth failed for ${req.method} ${req.path}: No token provided`);
    return res.status(401).json({ message: 'No authentication token. Please log in.' });
  }

  // Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkey_12345');
    req.user = decoded.user;
    next();
  } catch (err) {
    console.warn(`⚠ Auth failed for ${req.method} ${req.path}: Invalid token - ${err.message}`);
    return res.status(401).json({ message: 'Token is invalid or expired. Please log in again.' });
  }
};
