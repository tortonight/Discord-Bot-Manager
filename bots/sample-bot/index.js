console.log('Sample Bot started successfully!');
console.log('Bot is connecting to Discord...');

setTimeout(() => {
  console.log('Bot is now online!');
  console.log('Ready to serve!');
}, 2000);

process.on('SIGTERM', () => {
  console.log('Bot shutting down gracefully...');
  process.exit(0);
});

setInterval(() => {
  console.log('Bot heartbeat: OK');
}, 30000);

console.log('Bot process running on PID:', process.pid);
