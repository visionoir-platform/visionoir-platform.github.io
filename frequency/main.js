import './studio.css';
if (new URL(location.href).searchParams.get('view') === 'vj') {
  const { mountVJ } = await import('./chromatic/index.js');
  await mountVJ(document.body);
} else {
  const { startStudio } = await import('./studio.js');
  await startStudio();
}
