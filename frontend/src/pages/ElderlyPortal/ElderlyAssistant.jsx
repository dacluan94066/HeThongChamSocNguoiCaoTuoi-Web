import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Button, Input } from 'antd';
import { CloseOutlined, DeleteOutlined, MessageOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import AssistantMarkdown from './AssistantMarkdown';
import './ElderlyAssistant.css';
import { useAuth } from '../../context/AuthContext';

export function ElderlyAssistantPage() {
  const { assistantStore: store, profile, assistantReturnTo } = useOutletContext();
  const { logout } = useAuth();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot), navigate = useNavigate();
  const item = state.conversations.find(conversation => conversation.id === state.selectedId);
  const input = useRef(null), log = useRef(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { store.activate(); store.loadContext(); }, [store]);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, [item.id]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [item.id, item.messages.length, item.pending]);
  const close = () => { navigate(assistantReturnTo?.() || '/ca-nhan'); requestAnimationFrame(() => document.getElementById('elderly-assistant-entry')?.focus()); };
  const send = event => { event.preventDefault(); store.send(); };
  return <section className="elderly-assistant" aria-label="Trợ lý CareSenior">
    <div className="elderly-assistant-heading"><div><span className="elderly-web-eyebrow"><MessageOutlined /> CareSenior Assistant</span><h1>Trợ lý CareSenior</h1><p>Hỏi về sức khỏe và cách sử dụng CareSenior.</p></div>
      <Button icon={<CloseOutlined />} onClick={close} aria-label="Đóng trò chuyện">Đóng</Button></div>
    <div className="elderly-assistant-layout">
      <aside className="elderly-assistant-conversations" aria-label="Hội thoại trong phiên">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setDeleting(false); store.create(); }}>Trò chuyện mới</Button>
        <label htmlFor="assistant-conversation">Cuộc trò chuyện trong phiên</label>
        <select id="assistant-conversation" value={item.id} onChange={event => { setDeleting(false); store.select(Number(event.target.value)); }}>
          {state.conversations.map(conversation => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}
        </select>
        <div className="elderly-assistant-conversation-list">{state.conversations.map(conversation => <button key={conversation.id} type="button" aria-current={conversation.id === item.id ? 'true' : undefined}
          onClick={() => { setDeleting(false); store.select(conversation.id); }}><MessageOutlined aria-hidden="true" /><span>{conversation.title}</span></button>)}</div>
        <p>Chỉ giữ trong phiên đăng nhập này. Nội dung không được khôi phục sau khi tải lại hoặc đóng trình duyệt.</p>
        {!deleting ? <Button icon={<DeleteOutlined />} onClick={() => setDeleting(true)}>Xóa cuộc trò chuyện này</Button>
          : <div className="elderly-assistant-delete" role="group" aria-label="Xác nhận xóa hội thoại"><p>Xóa nội dung hội thoại này khỏi phiên?</p><Button danger onClick={() => { store.remove(item.id); setDeleting(false); }}>Đồng ý xóa</Button><Button onClick={() => setDeleting(false)}>Hủy</Button></div>}
      </aside>
      <div className="elderly-assistant-chat">
        <div className="elderly-assistant-profile"><span className="elderly-assistant-online" aria-hidden="true" /><div><strong>{profile.hoTen}</strong><small>Chỉ sử dụng hồ sơ của bạn · Trợ lý không tự thay đổi dữ liệu</small></div></div>
        {state.contextPhase === 'loading' && <p role="status">Đang kiểm tra kết nối trợ lý…</p>}
        {state.contextPhase === 'error' && <Alert type="error" showIcon title="Chưa mở được trợ lý" description={state.contextError} action={<Button onClick={() => store.loadContext()}>Thử kết nối lại</Button>} />}
        {state.contextPhase === 'expired' && <Alert type="warning" showIcon title="Phiên trò chuyện đã hết hạn" description={state.contextError} action={<Button onClick={logout}>Đăng xuất</Button>} />}
        {state.contextPhase === 'ready' && !state.aiConfigured && <Alert type="warning" showIcon title="AI hiện chưa khả dụng" description="Tra cứu chức năng và dữ liệu ứng dụng vẫn có thể hoạt động. Trợ lý sẽ nói rõ khi chưa thể trả lời bằng AI." />}
        <div ref={log} className="elderly-assistant-log" role="log" aria-label="Nội dung trò chuyện" aria-live="polite" aria-relevant="additions text">
          {!item.messages.length && <div className="elderly-assistant-empty"><span aria-hidden="true"><MessageOutlined /></span><h2>Tôi có thể hỗ trợ gì cho bạn?</h2><p>Bạn có thể hỏi “Lịch thuốc hôm nay của tôi?” hoặc “Tôi bị đau đầu thì nên làm gì?”.</p></div>}
          {item.messages.map(message => <article key={message.id} className={`elderly-assistant-message is-${message.role}`}>
            <strong className="elderly-assistant-speaker">{message.role === 'user' ? 'Bạn' : `CareSenior · ${message.mode === 'ai' ? 'AI' : 'Tra cứu theo chức năng'}`}</strong>
            {message.role === 'assistant' && ['ai_unavailable', 'missing_config'].includes(message.modeReason) && <p className="elderly-assistant-mode-note">AI chưa khả dụng cho câu trả lời này.</p>}
            {message.role === 'user' ? <p>{message.text}</p> : <AssistantMarkdown text={message.text} />}
            {message.failed && <small>Chưa có câu trả lời cho lượt gửi này.</small>}
            {message.truncated && <small>Nội dung đã được rút gọn. Bạn có thể hỏi cụ thể hơn.</small>}
            {!!message.actions?.length && <div className="elderly-assistant-actions">{message.actions.map(action => <Link key={action.id} to={action.to}>{action.label}</Link>)}</div>}
          </article>)}
          {item.pending && <div className="elderly-assistant-thinking" role="status">Trợ lý đang xử lý câu hỏi…</div>}
        </div>
        {item.error && <Alert className="elderly-assistant-error" type="error" showIcon role="alert" title={item.error} />}
        <form className="elderly-assistant-composer" onSubmit={send}>
          <label htmlFor="assistant-question">Câu hỏi của bạn</label>
          <Input.TextArea ref={input} id="assistant-question" value={item.draft} onChange={event => store.setDraft(event.target.value)} maxLength={500}
            autoSize={{ minRows: 2, maxRows: 6 }} disabled={item.pending} placeholder="Nhập câu hỏi về CareSenior hoặc sức khỏe…" aria-describedby="assistant-input-help"
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) send(event); }} />
          <div className="elderly-assistant-send"><small id="assistant-input-help">{item.draft.length}/500 · Enter để gửi, Shift + Enter để xuống dòng</small>
            {item.pending ? <Button onClick={() => store.cancel()}>Dừng chờ phản hồi</Button> : <Button type="primary" htmlType="submit" icon={<SendOutlined />} disabled={state.contextPhase !== 'ready' || !item.draft.trim()}>Gửi câu hỏi</Button>}</div>
        </form>
        <p className="elderly-assistant-disclaimer">Thông tin sức khỏe chỉ mang tính tham khảo. Khi khẩn cấp, mở <Link to="/ca-nhan/sos">màn SOS</Link> và nhấn giữ 3 giây; trò chuyện không tự gửi SOS.</p>
      </div>
    </div>
  </section>;
}
