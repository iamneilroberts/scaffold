import { fetchKiwiFlights } from './kiwi-client.js';
import { buildKiwiSampleResult, dayFromNow } from './fixtures/kiwi-sample.js';
import { runTravelThinFlow } from './flow.js';

async function main(): Promise<void> {
  const live = process.argv.includes('--live');

  const kiwiResult = live
    ? await fetchKiwiFlights({ flyFrom: 'PNS', flyTo: 'YUL', departureDate: dayFromNow(45) })
    : buildKiwiSampleResult();

  const { view, desk } = await runTravelThinFlow(kiwiResult);

  console.log(`travel-thin demo (${live ? 'LIVE mcp.kiwi.com' : 'keyless recorded fixture'})`);
  console.log(JSON.stringify({ view, desk }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
