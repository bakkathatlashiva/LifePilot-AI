import { Router } from 'express';
import {
  handleCreateTask,
  handleGetTasks,
  handleGetTask,
  handleUpdateTask,
  handleDeleteTask,
  handleDashboardStats,
} from '../controllers/taskController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/stats', handleDashboardStats);
router.get('/', handleGetTasks);
router.post('/', handleCreateTask);
router.get('/:id', handleGetTask);
router.put('/:id', handleUpdateTask);
router.delete('/:id', handleDeleteTask);

export default router;
