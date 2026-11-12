import { call } from '../ui/api';
import { Modal } from '../ui/Modal';

/** Donación voluntaria: abre PayPal en el navegador. La app no procesa pagos ni datos de pago. */
export function DonateDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Apoyar Bingo Master" onClose={onClose}>
      <div className="form donate">
        <p>Bingo Master es <b>gratuito</b> y lo desarrolla una sola persona. Si le resulta útil en sus
          eventos, puede apoyar su desarrollo con una <b>donación voluntaria</b> del monto que quiera.</p>
        <ul>
          <li>La donación se hace en <b>PayPal</b>, que se abre en su navegador (paypal.me/saedocl).</li>
          <li>Es opcional: <b>no desbloquea funciones</b>; la aplicación funciona igual con o sin donación.</li>
          <li>Bingo Master no recibe ni guarda sus datos de pago; PayPal los trata según su propia política de privacidad.</li>
        </ul>
        <p className="muted small">¡Gracias! Otra forma de ayudar es calificar la aplicación en Microsoft Store (menú Ayuda).</p>
        <div className="row">
          <button className="primary" autoFocus onClick={() => { void call('help:openDonate'); onClose(); }}>Donar con PayPal</button>
          <button onClick={onClose}>Ahora no</button>
        </div>
      </div>
    </Modal>
  );
}
