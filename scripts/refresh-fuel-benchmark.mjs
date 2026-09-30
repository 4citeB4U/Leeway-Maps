import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export const SOURCE='https://www.eia.gov/petroleum/gasdiesel/includes/gas_diesel_rss.xml';
export function parseDieselRss(xml, fetchedAt = new Date().toISOString()) {
  const date=/Data For (\d{2})\/(\d{2})\/(\d{2})/.exec(xml);
  const block=xml.split('On-Highway Diesel Fuel Retail Price')[1]?.split(']]>')[0];
  if(!date||!block)throw new Error('EIA weekly diesel format changed');
  const asOf=`20${date[3]}-${date[1]}-${date[2]}`;
  const regions=[...block.matchAll(/(\d+\.\d+)\s+\.+\s*([^<]+)(?:<br\s*\/?>|$)/g)].map(m=>({region:m[2].trim(),priceUsdPerGallon:Number(m[1])}));
  if(regions.length<5||!regions.some(r=>r.region==='U.S.'))throw new Error('EIA diesel regions missing');
  return {schemaVersion:1,source:SOURCE,sourceName:'US Energy Information Administration',asOf,fetchedAt,kind:'WEEKLY_REGIONAL_DIESEL_AVERAGE',units:'USD/US gallon',regions};
}
async function main(){
  const response=await fetch(SOURCE,{headers:{'User-Agent':'LeeWay-Logistics/1.0 (https://github.com/4citeB4U/LEEWAY-LOGISTICS-)'},signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`EIA HTTP ${response.status}`);
  const xml=await response.text();if(xml.length>1000000)throw new Error('EIA feed too large');
  const result=parseDieselRss(xml);
  await writeFile(new URL('../public/fuel-benchmark.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  console.log(`EIA weekly diesel benchmark: ${result.asOf}, ${result.regions.length} regions. Not station prices.`);
}
if(process.argv[1]===fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e.message);process.exitCode=1;});
