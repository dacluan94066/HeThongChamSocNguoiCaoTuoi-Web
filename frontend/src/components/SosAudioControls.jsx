import { Button, Tooltip } from 'antd';
import { AudioMutedOutlined, SoundOutlined, StopOutlined, WarningOutlined } from '@ant-design/icons';
import './SosAudioControls.css';

// Presentation only: muting the sound never calls a SOS status/mutation API.
const SosAudioControls = ({ state = {}, onEnable, onDisable, onSilence, readOnly = false }) => {
  const enabled = Boolean(state.enabled);
  const needsRetry = enabled && Boolean(state.blocked || state.error);
  const coordinationUnavailable = state.coordinationAvailable === false;
  const toggleLabel = enabled ? 'Tắt âm thanh cảnh báo' : 'Bật âm thanh cảnh báo';
  const errorMessage = typeof state.error === 'string' ? state.error : '';

  return (
    <section className="sos-audio-controls" aria-label="Âm thanh cảnh báo SOS">
      <span className="sos-audio-controls__label">Âm thanh SOS</span>
      <div className="sos-audio-controls__toolbar">
        <Tooltip title={enabled
          ? 'Tắt âm thanh cho các SOS tiếp theo. Cảnh báo trên màn hình vẫn được giữ.'
          : readOnly ? 'Bật âm thanh SOS và nghe thử một tiếng ngắn. Chỉ SOS vừa được kiểm tra quyền mới được phát chuông.'
            : 'Bật âm thanh SOS và nghe thử một tiếng chuông ngắn. SOS chưa xử lý vừa nhận khi tắt âm thanh cũng có thể phát chuông.'}>
          <Button
            className={`sos-audio-controls__toggle${enabled ? ' is-enabled' : ''}`}
            icon={enabled ? <SoundOutlined /> : <AudioMutedOutlined />}
            aria-label={toggleLabel}
            aria-pressed={enabled}
            onClick={enabled ? onDisable : onEnable}
          >
            {toggleLabel}
          </Button>
        </Tooltip>

        {state.ringing && (
          <Tooltip title={readOnly ? 'Chỉ dừng âm thanh, không thay đổi trạng thái SOS.' : 'Tắt chuông không đánh dấu SOS đã xử lý. Hãy mở chi tiết để tiếp nhận hoặc xử lý.'}>
            <Button
              danger
              className="sos-audio-controls__silence"
              icon={<StopOutlined />}
              aria-label="Tắt chuông"
              onClick={onSilence}
            >
              Tắt chuông
            </Button>
          </Tooltip>
        )}

        {needsRetry && !coordinationUnavailable && (
          <Button
            className="sos-audio-controls__retry"
            icon={<WarningOutlined />}
            onClick={onEnable}
          >
            Cho phép âm thanh
          </Button>
        )}
      </div>

      {(needsRetry || coordinationUnavailable) && (
        <p className="sos-audio-controls__feedback" role="status" aria-live="polite">
          <WarningOutlined aria-hidden="true" />
          <span>
            {coordinationUnavailable
              ? 'Chưa thể phối hợp chuông giữa các tab. Hãy dùng Chrome trên HTTPS/localhost và cho phép lưu trữ. Cảnh báo SOS vẫn hiển thị.'
              : state.blocked
                ? 'Chrome chưa cho phép tự phát âm thanh. Nhấn “Cho phép âm thanh” để thử lại. Cảnh báo SOS vẫn hiển thị.'
                : `Chưa phát được chuông${errorMessage ? `: ${errorMessage}` : '.'} Cảnh báo SOS vẫn hiển thị; hãy thử lại âm thanh.`}
          </span>
        </p>
      )}
    </section>
  );
};

export default SosAudioControls;
