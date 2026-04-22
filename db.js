const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/data/data.json';

// Create data directory if it doesn't exist
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Initialize database with default structure
const defaultData = {
  users: [],
  challenges: [],
  daily_logs: []
};

// Load database
function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      saveDB(defaultData);
      return defaultData;
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading database:', error);
    return defaultData;
  }
}

// Save database
function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Get all items from collection
function getAll(collection) {
  const db = loadDB();
  return db[collection] || [];
}

// Get item by ID
function getById(collection, id) {
  const items = getAll(collection);
  return items.find(item => item.id === id);
}

// Insert new item
function insert(collection, item) {
  const db = loadDB();
  if (!db[collection]) db[collection] = [];
  
  const newItem = {
    ...item,
    id: item.id || require('uuid').v4(),
    createdAt: new Date().toISOString()
  };
  
  db[collection].push(newItem);
  saveDB(db);
  return newItem;
}

// Update item
function update(collection, id, data) {
  const db = loadDB();
  if (!db[collection]) return null;
  
  const index = db[collection].findIndex(item => item.id === id);
  if (index === -1) return null;
  
  db[collection][index] = {
    ...db[collection][index],
    ...data,
    updatedAt: new Date().toISOString()
  };
  
  saveDB(db);
  return db[collection][index];
}

// Remove item
function remove(collection, id) {
  const db = loadDB();
  if (!db[collection]) return false;
  
  const index = db[collection].findIndex(item => item.id === id);
  if (index === -1) return false;
  
  db[collection].splice(index, 1);
  saveDB(db);
  return true;
}

module.exports = {
  getAll,
  getById,
  insert,
  update,
  remove
};