import jwt from 'jsonwebtoken';

function generateToken (payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken (token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export {
  generateToken,
  verifyToken
};
