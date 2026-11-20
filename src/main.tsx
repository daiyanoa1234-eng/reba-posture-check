import { render } from 'preact';
import { App } from './app';
import { setPwa } from './state/pwa';
import './styles.css';

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const update = registerSW({
        onNeedRefresh() {
          setPwa({ needRefresh: true, update: () => update(true) });
        },
        onOfflineReady() {
          setPwa({ offlineReady: true });
        },
      });
    })
    .catch(() => {
      /* SW が使えない環境（非HTTPSなど）でも通常動作は継続 */
    });
}
