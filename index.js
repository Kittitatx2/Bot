const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;
const keep_alive = require("./keep_alive.js");

const config = require('./settings.json');

function createBot() {
   const bot = mineflayer.createBot({
      username: config['bot-account']['username'],
      password: config['bot-account']['password'],
      auth: config['bot-account']['type'],
      host: config.server.ip,
      port: config.server.port,
      version: config.server.version,
   });

   bot.loadPlugin(pathfinder);

   const mcData = require('minecraft-data')(bot.version);
   const defaultMove = new Movements(bot, mcData);
   defaultMove.canDig = true; // ✅ ไม่ให้บอทขุดระหว่างเดิน
   bot.settings.colorsEnabled = false;

   let pendingPromise = Promise.resolve();

   function sendRegister(password) {
      return new Promise((resolve, reject) => {
         bot.chat(`/register ${password} ${password}`);
         console.log(`[Auth] Sent /register command.`);

         bot.once('chat', (username, message) => {
            console.log(`[ChatLog] <${username}> ${message}`);
            if (message.includes('successfully registered')) {
               console.log('[INFO] Registration confirmed.');
               resolve();
            } else if (message.includes('already registered')) {
               console.log('[INFO] Bot was already registered.');
               resolve();
            } else {
               reject(`Registration failed: "${message}"`);
            }
         });
      });
   }

   function sendLogin(password) {
      return new Promise((resolve, reject) => {
         bot.chat(`/login ${password}`);
         console.log(`[Auth] Sent /login command.`);

         bot.once('chat', (username, message) => {
            console.log(`[ChatLog] <${username}> ${message}`);
            if (message.includes('successfully logged in')) {
               console.log('[INFO] Login successful.');
               resolve();
            } else {
               reject(`Login failed: "${message}"`);
            }
         });
      });
   }

   bot.once('spawn', () => {
     console.log('\x1b[33m[AfkBot] Bot joined the server', '\x1b[0m');

     // Auto-auth
     if (config.utils['auto-auth'].enabled) {
       const password = config.utils['auto-auth'].password;
       pendingPromise = pendingPromise
         .then(() => sendRegister(password))
         .then(() => sendLogin(password))
         .catch(error => console.error('[ERROR]', error));
     }

     // Chat messages
     if (config.utils['chat-messages'].enabled) {
       const messages = config.utils['chat-messages']['messages'];
       if (config.utils['chat-messages'].repeat) {
         let i = 0;
         setInterval(() => {
           bot.chat(`${messages[i]}`);
           i = (i + 1) % messages.length;
         }, config.utils['chat-messages']['repeat-delay'] * 1000);
       } else {
         messages.forEach((msg) => bot.chat(msg));
       }
     }

     // ไปตำแหน่งเฉพาะ
     const pos = config.position;
     if (config.position.enabled) {
       bot.pathfinder.setMovements(defaultMove);
       bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
     }

     // มองกล้องแบบสุ่ม
     function randomLookAround() {
       const yaw = Math.random() * 2 * Math.PI;
       const pitch = (Math.random() - 0.5) * Math.PI / 4;
       bot.look(yaw, pitch, true, () => {
         setTimeout(randomLookAround, 4000);
       });
     }
     randomLookAround();

     // เดินสุ่ม
     function getRandomGoal(radius = 15) {
       const pos = bot.entity.position;
       const randomX = pos.x + (Math.random() * 2 - 1) * radius;
       const randomZ = pos.z + (Math.random() * 2 - 1) * radius;

       const block = bot.blockAt(bot.entity.position.offset(randomX - pos.x, 1, randomZ - pos.z));
       if (block) {
         return new GoalBlock(block.position.x, block.position.y, block.position.z);
       } else {
         return new GoalBlock(Math.floor(randomX), Math.floor(pos.y), Math.floor(randomZ));
       }
     }

     function wander() {
       if (!bot.entity) return;
       const goal = getRandomGoal();
       console.log(`[AfkBot] เดินไปยัง: ${goal.x}, ${goal.y}, ${goal.z}`);

       bot.pathfinder.setGoal(goal);

       function onArrived() {
         console.log('[AfkBot] ถึงเป้าหมายแล้ว รอสุ่มเป้าหมายใหม่...');
         bot.removeListener('goal_reached', onArrived);
         setTimeout(wander, 3000);
       }
       bot.once('goal_reached', onArrived);
     }

     // เริ่ม wander ถ้าไม่ได้เปิด position.fixed
     if (!config.position.enabled) {
       bot.pathfinder.setMovements(defaultMove);
       wander();
     }

     // Anti-AFK
     if (config.utils['anti-afk'].enabled) {
       setInterval(() => {
         bot.setControlState('jump', true);
         setTimeout(() => bot.setControlState('jump', false), 300);
       }, 10000);

       if (config.utils['anti-afk'].sneak) {
         bot.setControlState('sneak', true);
       }

       if (config.utils['anti-afk'].move && config.position.enabled) {
         let forward = true;
         setInterval(() => {
           bot.setControlState('forward', forward);
           bot.setControlState('back', !forward);
           forward = !forward;
         }, 4000);
       }
     }
   });

   bot.on('goal_reached', () => {
      console.log(`\x1b[32m[AfkBot] Bot arrived at: ${bot.entity.position}\x1b[0m`);
   });

   bot.on('death', () => {
      console.log(`\x1b[33m[AfkBot] Bot died at: ${bot.entity.position}\x1b[0m`);
   });

   if (config.utils['auto-reconnect']) {
      bot.on('end', () => {
         setTimeout(() => {
            createBot();
         }, config.utils['auto-recconect-delay']);
      });
   }

   bot.on('kicked', (reason) => {
      console.log(`\x1b[33m[AfkBot] Bot was kicked: ${reason}\x1b[0m`);
   });

   bot.on('error', (err) => {
      console.log(`\x1b[31m[ERROR] ${err.message}\x1b[0m`);
   });
}

createBot();
