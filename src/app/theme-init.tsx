export function ThemeInitScript() {
  const script = `(function(){try{var h=location.hostname;if(h!=='localhost'&&h!=='127.0.0.1')return;var t=localStorage.getItem('fundos_theme_v1');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
