import { Router } from 'express';
import {
  devLogin,
  googleLogin,
  gmailConnect,
  googleCallback,
  exchangeCode,
  refreshToken,
  getProfile,
  logout,
  disconnectAccount,
  generatePairingCode,
  consumePairingCode,
  googleTokenLogin,
} from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/dev-login', devLogin);
router.get('/google', authLimiter, googleLogin);
router.get('/google/gmail', authLimiter, gmailConnect);
router.get('/google/callback', googleCallback);
router.post('/google/token', authLimiter, googleTokenLogin);
router.post('/exchange-code', authLimiter, exchangeCode);
router.post('/pair/generate', requireAuth, generatePairingCode);
router.post('/pair/consume', authLimiter, consumePairingCode);
router.post('/refresh', authLimiter, refreshToken);
router.get('/profile', requireAuth, getProfile);
router.post('/logout', requireAuth, logout);
router.delete('/accounts/:provider', requireAuth, disconnectAccount);

export default router;
