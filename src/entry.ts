import { resumeArrival } from './elevator';
import { initAppTools } from './app-tools';
/** The original office is the home screen. Friends and customization are optional menu content. */
const params = new URLSearchParams(location.search);
initAppTools(); // optional App & alerts dialog and service worker; opens only on the `office-app-tools` event, never prompts
if (params.get('view') === 'friends') {
  void import('./building');
} else {
  resumeArrival();
  void import('./main');
}
