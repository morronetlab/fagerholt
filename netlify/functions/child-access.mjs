/** Single child data API: QR bearer or preview-only approved Feide cookie. */
import {createChildAccessHandler} from '../../lib/child-access.mjs';
import {resolveFeideChildContext} from '../../lib/feide-child-session.mjs';
export default createChildAccessHandler({feideContextResolver:resolveFeideChildContext});
