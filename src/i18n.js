/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - interface languages (English, Arabic, French, Spanish)
 * The interface text (menus, buttons, headings, AIP section titles and item
 * labels) is translated in place: every text node that exactly matches an
 * English phrase of the dictionary is replaced; new content is translated as it
 * appears. AIXM data values (names, codes, coordinates, remarks) are never
 * changed. Arabic switches the page to right-to-left.
 * ========================================================================== */
var I18N = (function () {
  'use strict';
  var LANGS = { en: { name: 'English', dir: 'ltr' }, ar: { name: 'العربية', dir: 'rtl' }, fr: { name: 'Français', dir: 'ltr' }, es: { name: 'Español', dir: 'ltr' } };

  // [English, Arabic, French, Spanish]
  var T = [
    // navigation and top bar
    ['Library', 'المكتبة', 'Bibliothèque', 'Biblioteca'], ['Files', 'الملفات', 'Fichiers', 'Archivos'], ['Dashboard', 'لوحة المعلومات', 'Tableau de bord', 'Panel'],
    ['AIP', 'دليل الطيران', 'AIP', 'AIP'], ['Map', 'الخريطة', 'Carte', 'Mapa'], ['Changes', 'التغييرات', 'Modifications', 'Cambios'], ['Timeline', 'الخط الزمني', 'Chronologie', 'Cronología'],
    ['Compare', 'مقارنة', 'Comparer', 'Comparar'], ['NOTAM', 'نوتام', 'NOTAM', 'NOTAM'], ['Quality', 'الجودة', 'Qualité', 'Calidad'], ['Explorer', 'المستكشف', 'Explorateur', 'Explorador'],
    ['Export', 'تصدير', 'Exporter', 'Exportar'], ['Latest data', 'أحدث البيانات', 'Données les plus récentes', 'Datos más recientes'], ['Valid on date…', 'السارية في تاريخ…', 'Valides à la date…', 'Vigentes en la fecha…'],
    ['AIXM Code Converter', 'محوّل رموز AIXM', 'Convertisseur de code AIXM', 'Conversor de código AIXM'],
    // common buttons
    ['Print', 'طباعة', 'Imprimer', 'Imprimir'], ['E-mail', 'بريد إلكتروني', 'E-mail', 'Correo'], ['Copy', 'نسخ', 'Copier', 'Copiar'], ['Save', 'حفظ', 'Enregistrer', 'Guardar'],
    ['Open', 'فتح', 'Ouvrir', 'Abrir'], ['Cancel', 'إلغاء', 'Annuler', 'Cancelar'], ['Extract', 'استخراج', 'Extraire', 'Extraer'], ['Convert', 'تحويل', 'Convertir', 'Convertir'],
    ['Save PDF', 'حفظ PDF', 'Enregistrer en PDF', 'Guardar PDF'], ['Save PNG', 'حفظ PNG', 'Enregistrer en PNG', 'Guardar PNG'], ['Print map', 'طباعة الخريطة', 'Imprimer la carte', 'Imprimir mapa'],
    ['Copy link', 'نسخ الرابط', 'Copier le lien', 'Copiar enlace'], ['☆ Save', '☆ حفظ', '☆ Enregistrer', '☆ Guardar'], ['Copy XML', 'نسخ XML', 'Copier le XML', 'Copiar XML'],
    ['All data', 'كل البيانات', 'Toutes les données', 'Todos los datos'], ['View AIXM', 'عرض AIXM', 'Voir l’AIXM', 'Ver AIXM'], ['AIP section', 'قسم دليل الطيران', 'Section AIP', 'Sección AIP'],
    ['Run checks', 'تشغيل الفحوص', 'Lancer les contrôles', 'Ejecutar comprobaciones'], ['Open latest', 'فتح الأحدث', 'Ouvrir le plus récent', 'Abrir el más reciente'],
    ['Open AIXM files', 'فتح ملفات AIXM', 'Ouvrir des fichiers AIXM', 'Abrir archivos AIXM'], ['Drop AIXM files here', 'أفلت ملفات AIXM هنا', 'Déposez les fichiers AIXM ici', 'Suelte aquí los archivos AIXM'],
    ['AMDT report', 'تقرير التعديل', 'Rapport AMDT', 'Informe AMDT'], ['Highlight in AIP', 'إبراز في دليل الطيران', 'Surligner dans l’AIP', 'Resaltar en el AIP'],
    ['Show on map', 'عرض على الخريطة', 'Afficher sur la carte', 'Mostrar en el mapa'], ['Copy all NOTAM text', 'نسخ كل نصوص النوتام', 'Copier tous les NOTAM', 'Copiar todos los NOTAM'],
    ['Differences PDF', 'الفروقات PDF', 'Différences PDF', 'Diferencias PDF'], ['Fit data', 'ملاءمة البيانات', 'Ajuster aux données', 'Ajustar a los datos'], ['Measure', 'قياس', 'Mesurer', 'Medir'], ['Layers', 'الطبقات', 'Couches', 'Capas'],
    // headings
    ['Changes inside the file', 'التغييرات داخل الملف', 'Modifications dans le fichier', 'Cambios dentro del archivo'], ['Compare two AIP data sets', 'مقارنة مجموعتي بيانات دليل الطيران', 'Comparer deux jeux de données AIP', 'Comparar dos conjuntos de datos AIP'],
    ['Data quality check', 'فحص جودة البيانات', 'Contrôle de qualité des données', 'Control de calidad de datos'], ['State library', 'مكتبة الدول', 'Bibliothèque des États', 'Biblioteca de Estados'],
    ['Digital NOTAM', 'النوتام الرقمي', 'NOTAM numérique', 'NOTAM digital'], ['Temporary changes and NOTAM periods', 'التغييرات المؤقتة وفترات النوتام', 'Modifications temporaires et périodes NOTAM', 'Cambios temporales y periodos NOTAM'],
    ['Side by side', 'جنبًا إلى جنب', 'Côte à côte', 'Lado a lado'], ['Single view', 'عرض واحد', 'Vue simple', 'Vista única'], ['Only differences', 'الفروقات فقط', 'Différences seulement', 'Solo diferencias'],
    ['Highlight changes', 'إبراز التغييرات', 'Surligner les modifications', 'Resaltar cambios'], ['List all changes', 'عرض كل التغييرات', 'Lister toutes les modifications', 'Listar todos los cambios'],
    ['Compare with previous cycle', 'مقارنة بالدورة السابقة', 'Comparer avec le cycle précédent', 'Comparar con el ciclo anterior'],
    ['Base map', 'الخريطة الأساسية', 'Fond de carte', 'Mapa base'], ['Aeronautical layers', 'الطبقات الملاحية', 'Couches aéronautiques', 'Capas aeronáuticas'], ['Airspace', 'المجال الجوي', 'Espace aérien', 'Espacio aéreo'],
    ['Procedures', 'الإجراءات', 'Procédures', 'Procedimientos'], ['Display', 'العرض', 'Affichage', 'Visualización'], ['Labels', 'التسميات', 'Étiquettes', 'Etiquetas'], ['All aerodromes', 'كل المطارات', 'Tous les aérodromes', 'Todos los aeródromos'],
    ['Aerodromes / heliports', 'المطارات / مهابط الطائرات العمودية', 'Aérodromes / hélistations', 'Aeródromos / helipuertos'], ['Runways, aprons, taxiways', 'المدارج وساحات الوقوف وممرات السير', 'Pistes, aires de trafic, voies de circulation', 'Pistas, plataformas, calles de rodaje'],
    ['Radio navigation aids', 'مساعدات الملاحة الراديوية', 'Aides radio à la navigation', 'Radioayudas para la navegación'], ['Designated points', 'النقاط المحددة', 'Points désignés', 'Puntos designados'], ['ATS routes', 'طرق خدمات الحركة الجوية', 'Routes ATS', 'Rutas ATS'],
    ['Obstacles', 'العوائق', 'Obstacles', 'Obstáculos'], ['Aeronautical ground lights', 'الأضواء الأرضية الملاحية', 'Feux aéronautiques au sol', 'Luces aeronáuticas de superficie'],
    ['Instrument procedures (SID / STAR / approach)', 'إجراءات الطيران الآلي (المغادرة / الوصول / الاقتراب)', 'Procédures aux instruments (SID / STAR / approche)', 'Procedimientos por instrumentos (SID / STAR / aproximación)'],
    ['Paper', 'الورق', 'Papier', 'Papel'], ['Title', 'العنوان', 'Titre', 'Título'], ['A4 landscape', 'A4 أفقي', 'A4 paysage', 'A4 horizontal'], ['A4 portrait', 'A4 عمودي', 'A4 portrait', 'A4 vertical'], ['A3 landscape', 'A3 أفقي', 'A3 paysage', 'A3 horizontal'], ['A3 portrait', 'A3 عمودي', 'A3 portrait', 'A3 vertical'],
    ['Legend', 'مفتاح الخريطة', 'Légende', 'Leyenda'], ['North arrow', 'سهم الشمال', 'Flèche du nord', 'Flecha del norte'], ['Coordinate grid', 'شبكة الإحداثيات', 'Quadrillage', 'Cuadrícula'], ['Scale bar', 'مقياس الرسم', 'Échelle', 'Escala'],
    ['Current view', 'العرض الحالي', 'Vue actuelle', 'Vista actual'], ['Saved views', 'العروض المحفوظة', 'Vues enregistrées', 'Vistas guardadas'], ['Opened files', 'الملفات المفتوحة', 'Fichiers ouverts', 'Archivos abiertos'],
    // table headers and statuses
    ['Effective', 'السريان', 'En vigueur', 'Vigencia'], ['Effective from', 'ساري من', 'En vigueur à partir du', 'Vigente desde'], ['Effective date', 'تاريخ السريان', 'Date d’entrée en vigueur', 'Fecha de vigencia'], ['Until', 'حتى', 'Jusqu’au', 'Hasta'],
    ['Feature', 'العنصر', 'Élément', 'Elemento'], ['Change', 'التغيير', 'Modification', 'Cambio'], ['Type', 'النوع', 'Type', 'Tipo'], ['Name', 'الاسم', 'Nom', 'Nombre'], ['Remarks', 'ملاحظات', 'Remarques', 'Observaciones'],
    ['Property', 'الخاصية', 'Propriété', 'Propiedad'], ['Source', 'المصدر', 'Source', 'Fuente'], ['File', 'الملف', 'Fichier', 'Archivo'], ['Line', 'السطر', 'Ligne', 'Línea'], ['Location', 'الموقع', 'Emplacement', 'Ubicación'],
    ['Severity', 'الخطورة', 'Gravité', 'Gravedad'], ['Rule', 'القاعدة', 'Règle', 'Regla'], ['Message', 'الرسالة', 'Message', 'Mensaje'], ['Errors', 'أخطاء', 'Erreurs', 'Errores'], ['Warnings', 'تحذيرات', 'Avertissements', 'Advertencias'],
    ['added in new', 'مضاف في الجديد', 'ajoutés', 'añadidos'], ['removed', 'محذوف', 'supprimés', 'eliminados'], ['modified', 'معدّل', 'modifiés', 'modificados'], ['unchanged', 'دون تغيير', 'inchangés', 'sin cambios'],
    ['active now', 'نشط الآن', 'actifs', 'activos'], ['upcoming', 'قادم', 'à venir', 'próximos'], ['expired', 'منتهي', 'expirés', 'vencidos'], ['all', 'الكل', 'tous', 'todos'], ['today', 'اليوم', 'aujourd’hui', 'hoy'], ['file', 'ملف', 'fichier', 'archivo'],
    ['AIXM version', 'إصدار AIXM', 'Version AIXM', 'Versión AIXM'], ['State', 'الدولة', 'État', 'Estado'], ['Aerodrome', 'المطار', 'Aérodrome', 'Aeródromo'], ['Aerodrome / heliport', 'المطار / مهبط الطائرات العمودية', 'Aérodrome / hélistation', 'Aeródromo / helipuerto'],
    ['Designator', 'المعرّف', 'Indicatif', 'Designador'], ['Frequency / Channel', 'التردد / القناة', 'Fréquence / canal', 'Frecuencia / canal'], ['Coordinates', 'الإحداثيات', 'Coordonnées', 'Coordenadas'], ['Elevation', 'الارتفاع', 'Altitude', 'Elevación'],
    ['Hours of operation', 'ساعات التشغيل', 'Heures de fonctionnement', 'Horario de funcionamiento'], ['Call sign', 'نداء الاتصال', 'Indicatif d’appel', 'Distintivo de llamada'], ['Service designation', 'تسمية الخدمة', 'Désignation du service', 'Designación del servicio'],
    ['Vertical limits', 'الحدود الرأسية', 'Limites verticales', 'Límites verticales'], ['Lateral limits', 'الحدود الأفقية', 'Limites latérales', 'Límites laterales'], ['Class', 'الفئة', 'Classe', 'Clase'], ['Unit', 'الوحدة', 'Organisme', 'Dependencia'],
    ['Designations RWY NR', 'رقم المدرج', 'Désignation RWY NR', 'Designación RWY NR'], ['True BRG', 'الاتجاه الحقيقي', 'Relèvement vrai', 'Marcación verdadera'], ['Dimensions of RWY', 'أبعاد المدرج', 'Dimensions de la RWY', 'Dimensiones de la RWY'],
    ['Strength (PCN / PCR) and surface of RWY and SWY', 'متانة (PCN) وسطح المدرج ومنطقة التوقف', 'Résistance (PCN) et revêtement RWY et SWY', 'Resistencia (PCN) y superficie de RWY y SWY'],
    ['THR elevation and highest elevation of TDZ', 'ارتفاع العتبة وأعلى ارتفاع لمنطقة ملامسة العجلات', 'Altitude du THR et altitude maximale de la TDZ', 'Elevación del THR y elevación máxima de la TDZ'], ['Slope of RWY/SWY', 'ميل المدرج/منطقة التوقف', 'Pente RWY/SWY', 'Pendiente RWY/SWY'],
    ['SWY dimensions', 'أبعاد منطقة التوقف', 'Dimensions SWY', 'Dimensiones SWY'], ['CWY dimensions', 'أبعاد منطقة الخلوص', 'Dimensions CWY', 'Dimensiones CWY'], ['Strip dimensions', 'أبعاد شريط المدرج', 'Dimensions de la bande', 'Dimensiones de la franja'],
    ['RESA dimensions', 'أبعاد منطقة الأمان في نهاية المدرج', 'Dimensions RESA', 'Dimensiones RESA'], ['Arresting system', 'نظام الإيقاف', 'Dispositif d’arrêt', 'Sistema de detención'],
    ['ARP coordinates and site at AD', 'إحداثيات النقطة المرجعية وموقعها في المطار', 'Coordonnées de l’ARP et emplacement sur l’AD', 'Coordenadas del ARP y emplazamiento en el AD'],
    ['Direction and distance from (city)', 'الاتجاه والمسافة من (المدينة)', 'Direction et distance de (la ville)', 'Dirección y distancia desde (la ciudad)'], ['Elevation / Reference temperature', 'الارتفاع / درجة الحرارة المرجعية', 'Altitude / température de référence', 'Elevación / temperatura de referencia'],
    ['Geoid undulation at AD ELEV PSN', 'تموج الجيود عند موقع ارتفاع المطار', 'Ondulation du géoïde à la position de l’ALT AD', 'Ondulación geoidal en la posición de ELEV AD'], ['MAG VAR / Annual change', 'الانحراف المغناطيسي / التغير السنوي', 'Déclinaison magnétique / variation annuelle', 'Declinación magnética / cambio anual'],
    ['AD operator, address, telephone, telefax, e-mail, AFS, website', 'مشغل المطار والعنوان والهاتف والفاكس والبريد الإلكتروني وAFS والموقع', 'Exploitant de l’AD, adresse, téléphone, télécopieur, e-mail, SFA, site web', 'Explotador del AD, dirección, teléfono, fax, correo, AFS, sitio web'],
    ['Types of traffic permitted (IFR/VFR)', 'أنواع الحركة المسموح بها (IFR/VFR)', 'Types de trafic autorisés (IFR/VFR)', 'Tipos de tránsito permitidos (IFR/VFR)'],
    ['AD category for firefighting', 'فئة المطار لمكافحة الحرائق', 'Catégorie SSLIA de l’AD', 'Categoría SSEI del AD'], ['Rescue equipment', 'معدات الإنقاذ', 'Équipement de sauvetage', 'Equipo de salvamento'],
    ['Declared distance available', 'المسافة المعلنة المتاحة', 'Distance déclarée disponible', 'Distancia declarada disponible'], ['RWY designator', 'معرّف المدرج', 'Indicatif RWY', 'Designador RWY'],
    ['Leg (ARINC 424)', 'المقطع (ARINC 424)', 'Segment (ARINC 424)', 'Tramo (ARINC 424)'], ['From', 'من', 'De', 'Desde'], ['To', 'إلى', 'À', 'Hasta'], ['Course / turn', 'المسار / الانعطاف', 'Route / virage', 'Rumbo / viraje'],
    ['Altitude', 'الارتفاع', 'Altitude', 'Altitud'], ['Speed', 'السرعة', 'Vitesse', 'Velocidad'], ['Transition', 'الانتقال', 'Transition', 'Transición'], ['Legs', 'المقاطع', 'Segments', 'Tramos'], ['Minima', 'الحدود الدنيا', 'Minimums', 'Mínimos'],
    ['Aircraft category', 'فئة الطائرة', 'Catégorie d’aéronef', 'Categoría de aeronave'], ['Final approach', 'الاقتراب النهائي', 'Approche finale', 'Aproximación final'], ['Visibility / RVR', 'الرؤية / مدى الرؤية على المدرج', 'Visibilité / RVR', 'Visibilidad / RVR'],
    ['Holding fix', 'نقطة الانتظار', 'Repère d’attente', 'Punto de espera'], ['Runway(s)', 'المدرج (المدارج)', 'Piste(s)', 'Pista(s)'], ['Type / RNAV', 'النوع / الملاحة المساحية', 'Type / RNAV', 'Tipo / RNAV'],
    // dashboard and misc
    ['Runways', 'المدارج', 'Pistes', 'Pistas'], ['Navaids', 'مساعدات الملاحة', 'Aides à la navigation', 'Radioayudas'], ['Airspaces', 'المجالات الجوية', 'Espaces aériens', 'Espacios aéreos'],
    ['Route segments', 'مقاطع الطرق', 'Tronçons de route', 'Tramos de ruta'], ['ATS units', 'وحدات خدمات الحركة الجوية', 'Organismes ATS', 'Dependencias ATS'], ['Frequencies', 'الترددات', 'Fréquences', 'Frecuencias'],
    ['Approach procedures', 'إجراءات الاقتراب', 'Procédures d’approche', 'Procedimientos de aproximación'], ['SIDs', 'إجراءات المغادرة (SID)', 'SID', 'SID'], ['STARs', 'إجراءات الوصول (STAR)', 'STAR', 'STAR'],
    ['AIXM features', 'عناصر AIXM', 'Éléments AIXM', 'Elementos AIXM'], ['feature types', 'أنواع العناصر', 'types d’éléments', 'tipos de elementos'], ['features with changes / time slices', 'عناصر بها تغييرات / شرائح زمنية', 'éléments avec modifications', 'elementos con cambios'],
    ['AIRAC cycle', 'دورة AIRAC', 'Cycle AIRAC', 'Ciclo AIRAC'], ['Data set details', 'تفاصيل مجموعة البيانات', 'Détails du jeu de données', 'Detalles del conjunto de datos'], ['Aerodromes and heliports', 'المطارات ومهابط الطائرات العمودية', 'Aérodromes et hélistations', 'Aeródromos y helipuertos'],
    ['Show in AIP (red = changed)', 'عرض في دليل الطيران (الأحمر = متغير)', 'Voir dans l’AIP (rouge = modifié)', 'Ver en el AIP (rojo = cambiado)'], ['Namespace / root', 'فضاء الأسماء / الجذر', 'Espace de noms / racine', 'Espacio de nombres / raíz'],
    ['Data valid from', 'البيانات سارية من', 'Données valides depuis', 'Datos vigentes desde'], ['Latest time slice start', 'بداية أحدث شريحة زمنية', 'Début de la dernière tranche', 'Inicio del último segmento temporal'], ['Created', 'تاريخ الإنشاء', 'Créé', 'Creado'],
    ['Read time', 'زمن القراءة', 'Temps de lecture', 'Tiempo de lectura'], ['Parse warnings', 'تحذيرات التحليل', 'Avertissements d’analyse', 'Advertencias de análisis'],
    ['Search ICAO code, runway, navaid, point, airspace, frequency…  (Ctrl+K)', 'ابحث عن رمز ICAO أو مدرج أو مساعد ملاحي أو نقطة أو مجال جوي أو تردد… (Ctrl+K)', 'Rechercher code OACI, piste, aide, point, espace aérien, fréquence… (Ctrl+K)', 'Buscar código OACI, pista, radioayuda, punto, espacio aéreo, frecuencia… (Ctrl+K)'],
    ['Filter sections / aerodromes', 'تصفية الأقسام / المطارات', 'Filtrer sections / aérodromes', 'Filtrar secciones / aeródromos'], ['Latest effective date in this section:', 'أحدث تاريخ سريان في هذا القسم:', 'Dernière date d’entrée en vigueur de cette section :', 'Última fecha de vigencia de esta sección:'],
    ['latest time slices', 'أحدث الشرائح الزمنية', 'dernières tranches temporelles', 'últimos segmentos temporales'], ['changed feature(s)', 'عنصر متغير', 'élément(s) modifié(s)', 'elemento(s) modificado(s)'], ['changed value(s)', 'قيمة متغيرة', 'valeur(s) modifiée(s)', 'valor(es) modificado(s)'],
    ['row(s) added', 'صف مضاف', 'ligne(s) ajoutée(s)', 'fila(s) añadida(s)'], ['load the previous cycle file to see every difference', 'حمّل ملف الدورة السابقة لرؤية كل الفروقات', 'chargez le fichier du cycle précédent pour voir toutes les différences', 'cargue el archivo del ciclo anterior para ver todas las diferencias'],
    ['change(s)', 'تغيير', 'modification(s)', 'cambio(s)'], ['temporary', 'مؤقت', 'temporaire(s)', 'temporal(es)'], ['Permanent change (new BASELINE)', 'تغيير دائم (خط أساس جديد)', 'Modification permanente (nouvelle BASELINE)', 'Cambio permanente (nueva BASELINE)'],
    ['Temporary change (TEMPDELTA)', 'تغيير مؤقت (TEMPDELTA)', 'Modification temporaire (TEMPDELTA)', 'Cambio temporal (TEMPDELTA)'], ['New feature', 'عنصر جديد', 'Nouvel élément', 'Elemento nuevo'],
    ['What changes (old → new)', 'ما الذي يتغير (القديم ← الجديد)', 'Ce qui change (ancien → nouveau)', 'Qué cambia (anterior → nuevo)'], ['What changed (old → new)', 'ما الذي تغير (القديم ← الجديد)', 'Ce qui a changé (ancien → nouveau)', 'Qué cambió (anterior → nuevo)'],
    ['Changed values (old → new)', 'القيم المتغيرة (القديم ← الجديد)', 'Valeurs modifiées (ancien → nouveau)', 'Valores cambiados (anterior → nuevo)'], ['Effective (new)', 'السريان (الجديد)', 'En vigueur (nouveau)', 'Vigencia (nuevo)'],
    ['Old / reference', 'القديم / المرجع', 'Ancien / référence', 'Anterior / referencia'], ['New', 'الجديد', 'Nouveau', 'Nuevo'], ['Help', 'مساعدة', 'Aide', 'Ayuda'],
    ['Part', 'الجزء', 'Partie', 'Parte'], ['Section', 'القسم', 'Section', 'Sección'], ['Amended', 'معدّل', 'Modifiés', 'Modificados'], ['Withdrawn', 'ملغى', 'Retirés', 'Retirados'], ['Action', 'الإجراء', 'Action', 'Acción'],
    ['Item', 'البند', 'Élément', 'Elemento'], ['Previous value', 'القيمة السابقة', 'Valeur précédente', 'Valor anterior'], ['New value', 'القيمة الجديدة', 'Nouvelle valeur', 'Valor nuevo'], ['Reason / source', 'السبب / المصدر', 'Motif / source', 'Motivo / fuente'],
    ['AIP sections affected by this amendment', 'أقسام دليل الطيران المتأثرة بهذا التعديل', 'Sections de l’AIP concernées par cet amendement', 'Secciones del AIP afectadas por esta enmienda'], ['Amendment', 'التعديل', 'Amendement', 'Enmienda'],
    ['Publish by', 'النشر قبل', 'Publier avant le', 'Publicar antes del'], ['Affected features', 'العناصر المتأثرة', 'Éléments concernés', 'Elementos afectados'],
    // AIP groups and sections
    ['GEN — General', 'GEN — عام', 'GEN — Généralités', 'GEN — Generalidades'], ['ENR — En-route', 'ENR — في الطريق', 'ENR — En route', 'ENR — En ruta'], ['AD — Aerodromes', 'AD — المطارات', 'AD — Aérodromes', 'AD — Aeródromos'],
    ['DESIGNATED AUTHORITIES', 'السلطات المعيّنة', 'SERVICES ADMINISTRATIFS DÉSIGNÉS', 'AUTORIDADES DESIGNADAS'], ['MEASURING SYSTEM, AIRCRAFT MARKINGS, HOLIDAYS', 'نظام القياس وعلامات الطائرات والعطلات', 'SYSTÈME DE MESURE, MARQUES D’AÉRONEFS, JOURS FÉRIÉS', 'SISTEMA DE MEDIDAS, MARCAS DE AERONAVES, DÍAS FESTIVOS'],
    ['LOCATION INDICATORS', 'مؤشرات المواقع', 'INDICATEURS D’EMPLACEMENT', 'INDICADORES DE LUGAR'], ['LIST OF RADIO NAVIGATION AIDS', 'قائمة مساعدات الملاحة الراديوية', 'LISTE DES AIDES RADIO À LA NAVIGATION', 'LISTA DE RADIOAYUDAS PARA LA NAVEGACIÓN'],
    ['AERONAUTICAL INFORMATION SERVICES', 'خدمات معلومات الطيران', 'SERVICES D’INFORMATION AÉRONAUTIQUE', 'SERVICIOS DE INFORMACIÓN AERONÁUTICA'], ['AIR TRAFFIC SERVICES', 'خدمات الحركة الجوية', 'SERVICES DE LA CIRCULATION AÉRIENNE', 'SERVICIOS DE TRÁNSITO AÉREO'],
    ['COMMUNICATION SERVICES', 'خدمات الاتصالات', 'SERVICES DE TÉLÉCOMMUNICATIONS', 'SERVICIOS DE COMUNICACIONES'], ['SEARCH AND RESCUE', 'البحث والإنقاذ', 'RECHERCHES ET SAUVETAGE', 'BÚSQUEDA Y SALVAMENTO'],
    ['GENERAL RULES AND PROCEDURES', 'القواعد والإجراءات العامة', 'RÈGLES ET PROCÉDURES GÉNÉRALES', 'REGLAS Y PROCEDIMIENTOS GENERALES'], ['FIR, UIR, TMA AND CTA', 'مناطق معلومات الطيران والمناطق المراقبة', 'FIR, UIR, TMA ET CTA', 'FIR, UIR, TMA Y CTA'],
    ['OTHER REGULATED AIRSPACE', 'مجالات جوية منظمة أخرى', 'AUTRES ESPACES AÉRIENS RÉGLEMENTÉS', 'OTRO ESPACIO AÉREO REGLAMENTADO'], ['CONVENTIONAL NAVIGATION ROUTES', 'طرق الملاحة التقليدية', 'ROUTES DE NAVIGATION CONVENTIONNELLE', 'RUTAS DE NAVEGACIÓN CONVENCIONAL'],
    ['AREA NAVIGATION ROUTES', 'طرق الملاحة المساحية', 'ROUTES DE NAVIGATION DE SURFACE', 'RUTAS DE NAVEGACIÓN DE ÁREA'], ['EN-ROUTE HOLDING', 'الانتظار في الطريق', 'ATTENTE EN ROUTE', 'ESPERA EN RUTA'],
    ['RADIO NAVIGATION AIDS – EN-ROUTE', 'مساعدات الملاحة الراديوية – في الطريق', 'AIDES RADIO À LA NAVIGATION – EN ROUTE', 'RADIOAYUDAS PARA LA NAVEGACIÓN – EN RUTA'], ['SPECIAL NAVIGATION SYSTEMS', 'أنظمة الملاحة الخاصة', 'SYSTÈMES SPÉCIAUX DE NAVIGATION', 'SISTEMAS ESPECIALES DE NAVEGACIÓN'],
    ['GLOBAL NAVIGATION SATELLITE SYSTEM', 'النظام العالمي للملاحة بالأقمار الصناعية', 'SYSTÈME MONDIAL DE NAVIGATION PAR SATELLITE', 'SISTEMA MUNDIAL DE NAVEGACIÓN POR SATÉLITE'],
    ['NAME-CODE DESIGNATORS FOR SIGNIFICANT POINTS', 'رموز أسماء النقاط المهمة', 'INDICATIFS CODÉS DES POINTS SIGNIFICATIFS', 'DESIGNADORES CLAVE DE PUNTOS SIGNIFICATIVOS'],
    ['AERONAUTICAL GROUND LIGHTS – EN-ROUTE', 'الأضواء الأرضية الملاحية – في الطريق', 'FEUX AÉRONAUTIQUES AU SOL – EN ROUTE', 'LUCES AERONÁUTICAS DE SUPERFICIE – EN RUTA'],
    ['PROHIBITED, RESTRICTED AND DANGER AREAS', 'المناطق المحظورة والمقيدة والخطرة', 'ZONES INTERDITES, RÉGLEMENTÉES ET DANGEREUSES', 'ZONAS PROHIBIDAS, RESTRINGIDAS Y PELIGROSAS'],
    ['MILITARY EXERCISE AND TRAINING AREAS AND AIR DEFENCE IDENTIFICATION ZONE (ADIZ)', 'مناطق التمارين والتدريب العسكري ومنطقة تمييز الدفاع الجوي (ADIZ)', 'ZONES D’EXERCICES ET D’ENTRAÎNEMENT MILITAIRES ET ZONE D’IDENTIFICATION DE DÉFENSE AÉRIENNE (ADIZ)', 'ZONAS DE EJERCICIOS Y ENTRENAMIENTO MILITAR Y ZONA DE IDENTIFICACIÓN DE DEFENSA AÉREA (ADIZ)'],
    ['OTHER ACTIVITIES OF A DANGEROUS NATURE AND OTHER POTENTIAL HAZARDS', 'أنشطة أخرى ذات طبيعة خطرة ومخاطر محتملة أخرى', 'AUTRES ACTIVITÉS DANGEREUSES ET AUTRES DANGERS POTENTIELS', 'OTRAS ACTIVIDADES PELIGROSAS Y OTROS RIESGOS POTENCIALES'],
    ['AIR NAVIGATION OBSTACLES', 'عوائق الملاحة الجوية', 'OBSTACLES À LA NAVIGATION AÉRIENNE', 'OBSTÁCULOS PARA LA NAVEGACIÓN AÉREA'], ['EN-ROUTE CHARTS', 'خرائط الطريق', 'CARTES EN ROUTE', 'CARTAS EN RUTA'],
    ['INDEX TO AERODROMES AND HELIPORTS', 'فهرس المطارات ومهابط الطائرات العمودية', 'INDEX DES AÉRODROMES ET HÉLISTATIONS', 'ÍNDICE DE AERÓDROMOS Y HELIPUERTOS'],
    ['AERODROME LOCATION INDICATOR AND NAME', 'مؤشر موقع المطار واسمه', 'INDICATEUR D’EMPLACEMENT ET NOM DE L’AÉRODROME', 'INDICADOR DE LUGAR Y NOMBRE DEL AERÓDROMO'],
    ['AERODROME GEOGRAPHICAL AND ADMINISTRATIVE DATA', 'البيانات الجغرافية والإدارية للمطار', 'DONNÉES GÉOGRAPHIQUES ET ADMINISTRATIVES DE L’AÉRODROME', 'DATOS GEOGRÁFICOS Y DE ADMINISTRACIÓN DEL AERÓDROMO'],
    ['OPERATIONAL HOURS', 'ساعات التشغيل', 'HEURES DE FONCTIONNEMENT', 'HORAS DE FUNCIONAMIENTO'], ['HANDLING SERVICES AND FACILITIES', 'خدمات ومرافق المناولة', 'SERVICES ET INSTALLATIONS D’ASSISTANCE EN ESCALE', 'SERVICIOS E INSTALACIONES DE ESCALA'],
    ['PASSENGER FACILITIES', 'مرافق الركاب', 'INSTALLATIONS POUR LES PASSAGERS', 'INSTALACIONES PARA LOS PASAJEROS'], ['RESCUE AND FIREFIGHTING SERVICES', 'خدمات الإنقاذ ومكافحة الحرائق', 'SERVICES DE SAUVETAGE ET DE LUTTE CONTRE L’INCENDIE', 'SERVICIOS DE SALVAMENTO Y EXTINCIÓN DE INCENDIOS'],
    ['SEASONAL AVAILABILITY – CLEARING', 'التوافر الموسمي – الإزالة', 'DISPONIBILITÉ SAISONNIÈRE – DÉNEIGEMENT', 'DISPONIBILIDAD ESTACIONAL – LIMPIEZA'],
    ['APRONS, TAXIWAYS AND CHECK LOCATIONS/POSITIONS DATA', 'بيانات ساحات الوقوف وممرات السير ومواقع الفحص', 'AIRES DE TRAFIC, VOIES DE CIRCULATION ET EMPLACEMENTS DE VÉRIFICATION', 'PLATAFORMAS, CALLES DE RODAJE Y PUNTOS DE VERIFICACIÓN'],
    ['SURFACE MOVEMENT GUIDANCE AND CONTROL SYSTEM AND MARKINGS', 'نظام توجيه ومراقبة الحركة السطحية والعلامات', 'SYSTÈME DE GUIDAGE ET DE CONTRÔLE DE LA CIRCULATION DE SURFACE ET BALISAGE', 'SISTEMA DE GUÍA Y CONTROL DEL MOVIMIENTO EN LA SUPERFICIE Y SEÑALES'],
    ['AERODROME OBSTACLES', 'عوائق المطار', 'OBSTACLES D’AÉRODROME', 'OBSTÁCULOS DEL AERÓDROMO'], ['METEOROLOGICAL INFORMATION PROVIDED', 'معلومات الأرصاد الجوية المقدمة', 'RENSEIGNEMENTS MÉTÉOROLOGIQUES FOURNIS', 'INFORMACIÓN METEOROLÓGICA PROPORCIONADA'],
    ['RUNWAY PHYSICAL CHARACTERISTICS', 'الخصائص المادية للمدرج', 'CARACTÉRISTIQUES PHYSIQUES DES PISTES', 'CARACTERÍSTICAS FÍSICAS DE LAS PISTAS'], ['DECLARED DISTANCES', 'المسافات المعلنة', 'DISTANCES DÉCLARÉES', 'DISTANCIAS DECLARADAS'],
    ['APPROACH AND RUNWAY LIGHTING', 'أضواء الاقتراب والمدرج', 'BALISAGE LUMINEUX D’APPROCHE ET DE PISTE', 'ILUMINACIÓN DE APROXIMACIÓN Y DE PISTA'], ['OTHER LIGHTING, SECONDARY POWER SUPPLY', 'إضاءة أخرى ومصدر الطاقة الاحتياطي', 'AUTRES BALISAGES, ALIMENTATION ÉLECTRIQUE DE SECOURS', 'OTRAS LUCES, FUENTE SECUNDARIA DE ENERGÍA'],
    ['HELICOPTER LANDING AREA', 'منطقة هبوط الطائرات العمودية', 'AIRE D’ATTERRISSAGE D’HÉLICOPTÈRES', 'ÁREA DE ATERRIZAJE DE HELICÓPTEROS'], ['AIR TRAFFIC SERVICES AIRSPACE', 'المجال الجوي لخدمات الحركة الجوية', 'ESPACE AÉRIEN ATS', 'ESPACIO AÉREO ATS'],
    ['AIR TRAFFIC SERVICES COMMUNICATION FACILITIES', 'مرافق اتصالات خدمات الحركة الجوية', 'INSTALLATIONS DE TÉLÉCOMMUNICATIONS ATS', 'INSTALACIONES DE COMUNICACIONES ATS'], ['RADIO NAVIGATION AND LANDING AIDS', 'مساعدات الملاحة الراديوية والهبوط', 'AIDES DE RADIONAVIGATION ET D’ATTERRISSAGE', 'RADIOAYUDAS PARA LA NAVEGACIÓN Y EL ATERRIZAJE'],
    ['LOCAL AERODROME REGULATIONS', 'اللوائح المحلية للمطار', 'RÈGLEMENTS LOCAUX DE L’AÉRODROME', 'REGLAMENTO LOCAL DEL AERÓDROMO'], ['NOISE ABATEMENT PROCEDURES', 'إجراءات خفض الضوضاء', 'PROCÉDURES D’ATTÉNUATION DU BRUIT', 'PROCEDIMIENTOS DE ATENUACIÓN DEL RUIDO'],
    ['FLIGHT PROCEDURES', 'إجراءات الطيران', 'PROCÉDURES DE VOL', 'PROCEDIMIENTOS DE VUELO'], ['ADDITIONAL INFORMATION', 'معلومات إضافية', 'RENSEIGNEMENTS SUPPLÉMENTAIRES', 'INFORMACIÓN ADICIONAL'],
    ['CHARTS RELATED TO AN AERODROME', 'الخرائط المتعلقة بالمطار', 'CARTES RELATIVES À L’AÉRODROME', 'CARTAS RELATIVAS AL AERÓDROMO'], ['HELIPORT DATA', 'بيانات مهبط الطائرات العمودية', 'DONNÉES DE L’HÉLISTATION', 'DATOS DEL HELIPUERTO'],
    ['APPROACH AND FATO LIGHTING', 'أضواء الاقتراب ومنطقة الاقتراب النهائي والإقلاع', 'BALISAGE LUMINEUX D’APPROCHE ET DE FATO', 'ILUMINACIÓN DE APROXIMACIÓN Y DE FATO'], ['LOCAL HELIPORT REGULATIONS', 'اللوائح المحلية لمهبط الطائرات العمودية', 'RÈGLEMENTS LOCAUX DE L’HÉLISTATION', 'REGLAMENTO LOCAL DEL HELIPUERTO'],
    ['CHARTS RELATED TO A HELIPORT', 'الخرائط المتعلقة بمهبط الطائرات العمودية', 'CARTES RELATIVES À L’HÉLISTATION', 'CARTAS RELATIVAS AL HELIPUERTO']
  ];
  var D = { ar: new Map(), fr: new Map(), es: new Map() };
  T.forEach(function (r) { D.ar.set(r[0], r[1]); D.fr.set(r[0], r[2]); D.es.set(r[0], r[3]); });

  // content that is AIXM data or code, never translated
  var SKIP = '.src, pre, code, textarea, .notam-text, td.val, .xml, .brand-sub, .crumbs, .tl-id, .tl-date, .search-results, .lib-file, .aff-chg, .sbs-head, [data-noi18n]';
  var lang = 'en', obs = null;
  function tr(s) {
    var d = D[lang];
    if (!d) return null;
    var x = d.get(s);
    if (x) return x;
    var m = /^((?:GEN|ENR|AD) [\d.]+ )(.+)$/.exec(s) || /^([\d,.]+ )(.+)$/.exec(s) || /^(.+?)( \(\d+\))$/.exec(s);
    if (m) { if (d.get(m[2])) return m[1] + d.get(m[2]); if (d.get(m[1])) return d.get(m[1]) + m[2]; }
    return null;
  }
  function translateNode(n) {
    var raw = n.__en !== undefined ? n.__en : n.nodeValue, t = raw.trim();
    if (!t || t.length > 140) return;
    var x = tr(t);
    if (x) { if (n.__en === undefined) n.__en = raw; n.nodeValue = raw.replace(t, x); }
    else if (n.__en !== undefined) { n.nodeValue = n.__en; delete n.__en; }
  }
  function walk(root) {
    if (!root || lang === 'en' && !root.__i18nTouched) return;
    if (root.nodeType === 3) { if (!(root.parentElement && root.parentElement.closest(SKIP))) translateNode(root); return; }
    if (root.nodeType !== 1 || root.closest && root.closest(SKIP)) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { var p = n.parentElement; return p && !p.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
    var n; while ((n = w.nextNode())) translateNode(n);
    root.querySelectorAll('[placeholder]').forEach(function (e) {
      var en = e.__enPh !== undefined ? e.__enPh : e.getAttribute('placeholder'), x = tr(en);
      if (x) { e.__enPh = en; e.setAttribute('placeholder', x); } else if (e.__enPh !== undefined) { e.setAttribute('placeholder', e.__enPh); delete e.__enPh; }
    });
  }
  function set(l) {
    if (!LANGS[l]) l = 'en';
    lang = l;
    var html = document.documentElement;
    html.setAttribute('lang', l === 'en' ? 'en' : l);
    html.setAttribute('dir', LANGS[l].dir);
    try { localStorage.setItem('aixm-lang', l); } catch (e) { /* storage unavailable */ }
    document.body.__i18nTouched = true;
    walk(document.body);
    if (!obs) {
      obs = new MutationObserver(function (list) {
        if (lang === 'en') return;
        list.forEach(function (m) { m.addedNodes.forEach(function (n) { walk(n); }); });
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }
  function init() {
    var l = 'en';
    try { l = localStorage.getItem('aixm-lang') || 'en'; } catch (e) { l = 'en'; }
    if (l !== 'en') set(l);
    return l;
  }
  return { LANGS: LANGS, set: set, init: init, t: function (s) { return tr(s) || s; }, lang: function () { return lang; }, count: T.length };
})();
