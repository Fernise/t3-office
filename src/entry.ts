import { resumeArrival } from './elevator';
import { initAppTools } from './app-tools';
import { restoreRememberedView } from './remembered-view';
/** The original office is the home screen. Friends and customization are optional menu content. */
const params = new URLSearchParams(location.search);
initAppTools(); // optional App & alerts dialog and service worker; opens only on the `office-app-tools` event, never prompts
if (params.get('view') === 'friends') {
  void import('./building');
} else {
  resumeArrival();
  // An opted-in remembered phone view reopens once per launch; otherwise the office loads as always.
  void restoreRememberedView().then((left) => { if (!left) void import('./main'); }, () => void import('./main'));
}
