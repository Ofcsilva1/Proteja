import { VIOLENCE_TYPES, SEXUAL_TYPES, splitViolence } from './violence.js?v=20261014.1';
import { normalize } from './import-core.js?v=20261014.1';

export function setupViolenceForm() {
  const groups = [
    ['tipoViolencia', 'tipo-violencia', 'Tipo de violência', VIOLENCE_TYPES],
    ['violenciaSexual', 'violencia-sexual', 'Sexual', SEXUAL_TYPES],
    ['outrasViolencias', 'outras-violencias', 'Outros', VIOLENCE_TYPES.filter(([id]) => id !== 'sexual')]
  ];
  const controls = groups.map(([key, id, title, options]) => {
    const container = document.createElement('fieldset'); container.className = 'violence-fieldset';
    const legend = document.createElement('legend'); legend.textContent = title;
    const hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.id = id;
    const choices = document.createElement('div'); choices.className = 'violence-choices';
    const checkboxes = options.map(([, label]) => {
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = label;
      checkbox.className = 'form-check-input';
      const wrapper = document.createElement('label'); wrapper.append(checkbox, document.createTextNode(label)); choices.append(wrapper);
      return checkbox;
    });
    const customLabel = document.createElement('label'); customLabel.htmlFor = `${id}-custom`; customLabel.textContent = 'Outra opção ou valor da planilha';
    const custom = document.createElement('input'); custom.type = 'text'; custom.id = `${id}-custom`; custom.className = 'form-control';
    custom.placeholder = 'Se necessário, separe as opções com ponto e vírgula';
    const sync = () => { hidden.value = [...checkboxes.filter(c => c.checked).map(c => c.value), ...splitViolence(custom.value)].join('; '); };
    choices.addEventListener('change', sync); custom.addEventListener('input', sync);
    container.append(legend, hidden, choices, customLabel, custom); document.getElementById('violence-fields').append(container);
    return { key, hidden, custom, checkboxes };
  });
  return {
    fill(data) {
      controls.forEach(({ key, hidden, custom, checkboxes }) => {
        const parts = splitViolence(data[key]); const known = new Set(checkboxes.map(c => normalize(c.value)));
        checkboxes.forEach(c => { c.checked = parts.some(p => normalize(p) === normalize(c.value)); });
        custom.value = parts.filter(p => !known.has(normalize(p))).join('; ');
        // Merely opening the form must preserve the original text exactly.
        hidden.value = data[key] || '';
      });
    }
  };
}
