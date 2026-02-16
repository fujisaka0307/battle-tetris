import { Router } from 'express';
import { getTopRankings } from '../db/playerStatsRepository.js';
import { getRecentMatches } from '../db/matchResultRepository.js';

const router = Router();

router.get('/rankings', (_req, res) => {
  const rankings = getTopRankings(20);
  res.json({ rankings });
});

router.get('/matches', (_req, res) => {
  const matches = getRecentMatches(20);
  res.json({ matches });
});

export default router;
