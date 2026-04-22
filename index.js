const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getAll, getById, insert, update, remove } = require('./db');

const app = express();
app.use(require("express").static(require("path").join(__dirname, "public")));
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'OK', message: '75 Hard Challenge API is running' });
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if user exists
    const users = getAll('users');
    const existingUser = users.find(u => u.email === email || u.username === username);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = insert('users', {
      username,
      email,
      password: hashedPassword,
      currentStreak: 0,
      bestStreak: 0,
      challengeStartDate: null,
      isActive: false,
      customTasks: []
    });
    
    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    
    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        currentStreak: user.currentStreak,
        bestStreak: user.bestStreak,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const users = getAll('users');
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        currentStreak: user.currentStreak,
        bestStreak: user.bestStreak,
        isActive: user.isActive,
        customTasks: user.customTasks || []
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile
app.get('/api/user/profile', authenticateToken, (req, res) => {
  const user = getById('users', req.user.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    currentStreak: user.currentStreak,
    bestStreak: user.bestStreak,
    isActive: user.isActive,
    challengeStartDate: user.challengeStartDate,
    customTasks: user.customTasks || []
  });
});

// Start challenge
app.post('/api/challenge/start', authenticateToken, (req, res) => {
  const user = update('users', req.user.userId, {
    isActive: true,
    challengeStartDate: new Date().toISOString(),
    currentStreak: 0
  });
  
  res.json({ success: true, user });
});

// Add custom task
app.post('/api/user/custom-task', authenticateToken, (req, res) => {
  const { task } = req.body;
  const user = getById('users', req.user.userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const customTasks = user.customTasks || [];
  customTasks.push({ id: require('uuid').v4(), task, createdAt: new Date().toISOString() });
  
  const updatedUser = update('users', req.user.userId, { customTasks });
  res.json({ customTasks: updatedUser.customTasks });
});

// Remove custom task
app.delete('/api/user/custom-task/:taskId', authenticateToken, (req, res) => {
  const { taskId } = req.params;
  const user = getById('users', req.user.userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const customTasks = (user.customTasks || []).filter(task => task.id !== taskId);
  const updatedUser = update('users', req.user.userId, { customTasks });
  
  res.json({ customTasks: updatedUser.customTasks });
});

// Log daily progress
app.post('/api/progress/log', authenticateToken, (req, res) => {
  const { completedTasks, date } = req.body;
  const user = getById('users', req.user.userId);
  
  if (!user || !user.isActive) {
    return res.status(400).json({ error: 'Challenge not active' });
  }
  
  // Required tasks for 75 Hard
  const requiredTasks = [
    'workout_1', 'workout_2', 'diet', 'water', 'photo', 'reading'
  ];
  
  // Check if all required tasks are completed
  const allRequired = requiredTasks.every(task => completedTasks.includes(task));
  
  // Check custom tasks
  const customTasks = user.customTasks || [];
  const allCustom = customTasks.every(task => completedTasks.includes(`custom_${task.id}`));
  
  const allCompleted = allRequired && allCustom;
  
  // Log the day
  insert('daily_logs', {
    userId: user.id,
    date,
    completedTasks,
    allCompleted
  });
  
  let newStreak = user.currentStreak;
  
  if (allCompleted) {
    newStreak = user.currentStreak + 1;
  } else {
    // Reset challenge if any task is missed
    newStreak = 0;
  }
  
  const updatedUser = update('users', req.user.userId, {
    currentStreak: newStreak,
    bestStreak: Math.max(user.bestStreak, newStreak),
    isActive: newStreak < 75 // Complete challenge at 75 days
  });
  
  res.json({
    success: true,
    currentStreak: updatedUser.currentStreak,
    challengeComplete: updatedUser.currentStreak >= 75
  });
});

// Get today's progress
app.get('/api/progress/today', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const logs = getAll('daily_logs');
  const todayLog = logs.find(log => log.userId === req.user.userId && log.date === today);
  
  res.json({
    completedTasks: todayLog ? todayLog.completedTasks : [],
    allCompleted: todayLog ? todayLog.allCompleted : false
  });
});

// Get leaderboard
app.get('/api/leaderboard', (req, res) => {
  const users = getAll('users');
  const leaderboard = users
    .filter(user => user.currentStreak > 0 || user.bestStreak > 0)
    .map(user => ({
      id: user.id,
      username: user.username,
      currentStreak: user.currentStreak,
      bestStreak: user.bestStreak,
      isActive: user.isActive,
      challengeStartDate: user.challengeStartDate
    }))
    .sort((a, b) => {
      if (a.currentStreak === b.currentStreak) {
        return b.bestStreak - a.bestStreak;
      }
      return b.currentStreak - a.currentStreak;
    });
  
  res.json(leaderboard);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});