/** Runs every 2 hours. Only configured public school grade URLs are checked. */
import {runSchoolSourceProbes} from '../../lib/school-source-probes.mjs';
export const config={schedule:'5 */2 * * *'};
export default async function handler(){
 await runSchoolSourceProbes();
 return new Response(null,{status:204});
}
