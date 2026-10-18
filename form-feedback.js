// Shared presentation only: persistence and business rules remain with their owners.
export function setupFormFeedback(form, reveal = () => {}) {
  const errors = new Map();
  form.noValidate = true;
  function clear(control) {
    control.setCustomValidity('');
    control.removeAttribute('aria-invalid');
    const message = errors.get(control);
    if (message) { message.textContent = ''; message.hidden = true; }
  }
  function show(control, text) {
    let message = errors.get(control);
    if (!message) {
      message = document.createElement('small');
      message.id = `${control.id}-error`;
      message.className = 'field-error';
      message.setAttribute('aria-live', 'polite');
      // Keep labels intact, and place input-group messages outside the group.
      (control.closest('.input-group') || control).after(message);
      const descriptions = new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      descriptions.add(message.id);
      control.setAttribute('aria-describedby', [...descriptions].join(' '));
      errors.set(control, message);
    }
    message.textContent = text; message.hidden = false;
    control.setAttribute('aria-invalid', 'true');
  }
  function focus(control) { reveal(control); control.focus(); }
  function validate(custom = {}) {
    for (const control of form.elements) if (control.setCustomValidity) clear(control);
    for (const [id, text] of Object.entries(custom)) {
      const control = form.querySelector(`#${id}`);
      if (control && !control.disabled) control.setCustomValidity(text);
    }
    let first = null;
    for (const control of form.elements) {
      if (!control.willValidate || control.validity.valid) continue;
      show(control, control.validity.valueMissing ? 'Preencha este campo.' : control.validationMessage);
      first ||= control;
    }
    if (first) focus(first);
    return !first;
  }
  function reset() { for (const control of errors.keys()) clear(control); }
  for (const event of ['input', 'change']) form.addEventListener(event, ({ target }) => {
    if (target.setCustomValidity) clear(target);
  });
  form.addEventListener('reset', reset);
  return { validate, reset, show, focus };
}
