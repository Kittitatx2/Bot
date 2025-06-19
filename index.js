const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const keepAlive = require("./keep_alive");
const config = require('./settings.json');
keepAlive();

const mySecret = process.env['shared'];

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

  bot.once('spawn', () => {
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = false;
    defaultMove.allowSprinting = false;
    defaultMove.scafoldingBlocks = [];

    bot.pathfinder.setMovements(defaultMove);
    bot.settings.colorsEnabled = false;

    let pendingPromise = Promise.resolve();

    function sendRegister(password) {
      return new Promise((resolve, reject) => {
        bot.chat(`/register ${password} ${password}`);
        bot.once('chat', (_, message) => {
          if (message.includes('successfully registered') || message.includes('already registered')) {
            resolve();
          } else {
            reject(`Register failed: ${message}`);
          }
        });
      });
    }

    function sendLogin(password) {
      return new Promise((resolve, reject) => {
        bot.chat(`/login ${password}`);
        bot.once('chat', (_, message) => {
          if (message.includes('successfully logged in')) {
            resolve();
          } else {
            reject(`Login failed: ${message}`);
          }
        });
      });
    }

    if (config.utils['auto-auth'].enabled) {
      const pass = config.utils['auto-auth'].password;
      pendingPromise = pendingPromise
        .then(() => sendRegister(pass))
        .then(() => sendLogin(pass))
        .catch(console.error);
    }

    if (config.utils['chat-messages'].enabled) {
      const messages = config.utils['chat-messages']['messages'];
      if (config.utils['chat-messages'].repeat) {
        let i = 0;
        setInterval(() => {
          bot.chat(`${messages[i]}`);
          i = (i + 1) % messages.length;
        }, config.utils['chat-messages']['repeat-delay'] * 1000);
      } else {
        messages.forEach(msg => bot.chat(msg));
      }
    }

    if (config.position.enabled) {
      const pos = config.position;
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    } else {
      wanderLoop(); // เริ่มเดินสุ่ม
    }

    function getSafeFlatGoal(radius = 10) {
      const base = bot.entity.position.floored();
      for (let i = 0; i < 10; i++) {
        const dx = Math.floor((Math.random() - 0.5) * radius * 2);
        const dz = Math.floor((Math.random() - 0.5) * radius * 2);
        const pos = base.offset(dx, 0, dz);
        const blockBelow = bot.blockAt(pos.offset(0, -1, 0));
        const blockAtPos = bot.blockAt(pos);
        if (blockBelow?.boundingBox === 'block' && blockAtPos?.boundingBox === 'empty') {
          return new GoalBlock(pos.x, pos.y, pos.z);
        }
      }
      return new GoalBlock(base.x, base.y, base.z);
    }

    function wanderLoop() {
      const goal = getSafeFlatGoal(15);
      bot.pathfinder.setGoal(goal);
      console.log(`[AfkBot] เดินไปยัง: ${goal.x}, ${goal.y}, ${goal.z}`);

      const onArrived = () => {
        console.log('[AfkBot] ถึงเป้าหมายแล้ว รอสุ่มใหม่...');
        bot.removeListener('goal_reached', onArrived);
        setTimeout(wanderLoop, 3000);
      };
      bot.once('goal_reached', onArrived);
    }

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

    function randomLookAround() {
      const yaw = Math.random() * 2 * Math.PI;
      const pitch = (Math.random() - 0.5) * Math.PI / 4;
      bot.look(yaw, pitch, true, () => {
        setTimeout(randomLookAround, 4000);
      });
    }
    randomLookAround();
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

  bot.on('kicked', reason => {
    console.log(`\x1b[33m[AfkBot] Bot was kicked: ${reason}\x1b[0m`);
  });

  bot.on('error', err => {
    console.log(`\x1b[31m[ERROR] ${err.message}\x1b[0m`);
  });
}

createBot();
