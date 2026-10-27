// ⚠️  The "it works on my machine" app. It is a single file, holds all state in memory,
// logs with console.log, has no shutdown handling and no config. It cannot be scaled
// horizontally and it drops in-flight requests on deploy. Your job is in README.md.
import express from 'express';

const app = express();
app.use(express.json());

var todos = [];
var nextId = 1;
var requests = {}; // ip -> count, for "rate limiting"
var API_TOKEN = 'secret-token-123';

app.use((req, res, next) => {
  console.log('request', req.method, req.url);
  requests[req.ip] = (requests[req.ip] || 0) + 1;
  if (requests[req.ip] > 100) {
    return res.status(429).send('too many requests');
  }
  next();
});

setInterval(() => { requests = {}; }, 60000);

app.get('/health', (req, res) => {
  res.send('OK');
});

app.get('/todos', (req, res) => {
  if (req.headers.authorization != 'Bearer ' + API_TOKEN) return res.status(401).send('no');
  res.json(todos);
});

app.post('/todos', (req, res) => {
  if (req.headers.authorization != 'Bearer ' + API_TOKEN) return res.status(401).send('no');
  var todo = { id: nextId++, title: req.body.title, done: false, createdAt: new Date() };
  todos.push(todo);
  console.log('created todo', todo);
  res.status(201).json(todo);
});

app.get('/todos/:id', (req, res) => {
  if (req.headers.authorization != 'Bearer ' + API_TOKEN) return res.status(401).send('no');
  var todo = todos.find((t) => t.id == req.params.id);
  res.json(todo);
});

app.patch('/todos/:id', (req, res) => {
  if (req.headers.authorization != 'Bearer ' + API_TOKEN) return res.status(401).send('no');
  var todo = todos.find((t) => t.id == req.params.id);
  todo.done = req.body.done;
  todo.title = req.body.title || todo.title;
  res.json(todo);
});

app.delete('/todos/:id', (req, res) => {
  if (req.headers.authorization != 'Bearer ' + API_TOKEN) return res.status(401).send('no');
  todos = todos.filter((t) => t.id != req.params.id);
  res.send('deleted');
});

// Simulates a slow downstream call (DB report, third-party API...). Keep the delay: the
// graceful-shutdown check relies on requests that are still in flight when SIGTERM arrives.
app.get('/todos/export/slow', (req, res) => {
  setTimeout(() => {
    res.json({ count: todos.length, todos });
  }, 2000);
});

app.listen(3000, () => {
  console.log('server started on 3000');
});
