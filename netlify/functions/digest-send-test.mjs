/** No unauthenticated or arbitrary-address test mail; Auth JWT verified server side. */
import {createDigestTestHandler} from '../../lib/weekly-digest-test.mjs';
export default createDigestTestHandler();
