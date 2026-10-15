import { Engine } from './services/engine.js';

function parseArgs(argv) {
  const args = { json: false, place: null, message: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--place') {
      args.place = argv[i + 1];
      i += 1;
    } else args.message.push(arg);
  }
  args.message = args.message.join(' ').trim();
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.message && !args.place) {
  console.log('WeatherGPT CLI');
  console.log('Usage:');
  console.log('  npm run cli -- "current weather in Mumbai"');
  console.log('  npm run cli -- "will it rain tomorrow in Kolkata"');
  console.log('  npm run cli -- "any alerts for Guwahati"');
  console.log('  npm run cli -- "climate analysis pune"');
  console.log('  node src/cli.js "delhi ka mausam" --json');
  process.exit(0);
}

const query = args.place ? `current weather in ${args.place}` : args.message;
const engine = new Engine();
engine.chat(query, 'cli').then((result) => {
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.text);
    if (result.cards?.alerts?.length) {
      console.log('');
      for (const alert of result.cards.alerts) {
        console.log(`  [${alert.severity.toUpperCase()}] ${alert.title} (${alert.date})`);
      }
    }
    console.log(`\n(mode: ${result.mode} · ${result.meta.latencyMs}ms)`);
  }
  process.exit(result.text ? 0 : 1);
}).catch((error) => {
  console.error('CLI error:', error.message);
  process.exit(1);
});
