import { useSelector, useDispatch } from 'react-redux';
import { dismissNotification } from '../features/uiSlice.js';

export function Notifications() {
  const dispatch = useDispatch();
  const notifications = useSelector((state) => state.ui.notifications);

  if (!notifications.length) return null;

  return (
    <div className="toast-stack">
      {notifications.map((n) => (
        <div key={n.id} className={`toast toast-${n.type}`}>
          <span>{n.message}</span>
          <button
            type="button"
            className="ghost small"
            onClick={() => dispatch(dismissNotification(n.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

