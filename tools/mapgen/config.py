# -*- coding: utf-8 -*-
"""Map generation config: 1936 ownership rules on top of modern Natural Earth admin-1 units."""

# Modern adm0_a3 -> grouping alias (micro-states and split territories merged with a neighbour)
ALIAS = {
    'AND': 'ESP', 'MCO': 'FRA', 'SMR': 'ITA', 'VAT': 'ITA', 'LIE': 'CHE',
    'PSX': 'ISR', 'CYN': 'CYP', 'ESB': 'CYP', 'WSB': 'CYP', 'PRK': 'KOR', 'SDS': 'SDN',
    'QAT': 'ARE', 'BHR': 'ARE', 'KOS': 'SRB', 'BRN': 'MYS', 'BDI': 'RWA',
    'LSO': 'ZAF', 'SWZ': 'ZAF', 'KAB': 'KAZ', 'KAS': 'IND', 'ALD': 'FIN', 'SOL': 'SOL',
    'USG': 'CUB', 'BTN': 'BTN',
}

# Modern country (after alias) -> owner tag in 1936
OWNER = {
    # Europe
    'DEU': 'GER', 'FRA': 'FRA', 'GBR': 'ENG', 'ITA': 'ITA', 'ESP': 'SPR', 'PRT': 'POR',
    'POL': 'POL', 'CZE': 'CZE', 'SVK': 'CZE', 'AUT': 'AUS', 'HUN': 'HUN', 'ROU': 'ROM',
    'MDA': 'ROM', 'BGR': 'BUL', 'GRC': 'GRE', 'ALB': 'ALB', 'TUR': 'TUR',
    'SRB': 'YUG', 'HRV': 'YUG', 'BIH': 'YUG', 'SVN': 'YUG', 'MNE': 'YUG', 'MKD': 'YUG',
    'NLD': 'HOL', 'BEL': 'BEL', 'LUX': 'LUX', 'CHE': 'SWI', 'IRL': 'IRE',
    'DNK': 'DEN', 'ISL': 'DEN', 'GRL': 'DEN', 'NOR': 'NOR', 'SWE': 'SWE', 'FIN': 'FIN',
    'EST': 'EST', 'LVA': 'LAT', 'LTU': 'LIT', 'CYP': 'ENG',
    # USSR
    'RUS': 'SOV', 'UKR': 'SOV', 'BLR': 'SOV', 'GEO': 'SOV', 'ARM': 'SOV', 'AZE': 'SOV',
    'KAZ': 'SOV', 'UZB': 'SOV', 'TKM': 'SOV', 'KGZ': 'SOV', 'TJK': 'SOV',
    # Middle East
    'IRN': 'PER', 'IRQ': 'IRQ', 'SAU': 'SAU', 'YEM': 'YEM', 'OMN': 'ENG', 'ARE': 'ENG',
    'KWT': 'ENG', 'ISR': 'ENG', 'JOR': 'ENG', 'SYR': 'FRA', 'LBN': 'FRA', 'AFG': 'AFG',
    'EGY': 'EGY',
    # Africa
    'LBY': 'ITA', 'TUN': 'FRA', 'DZA': 'FRA', 'MAR': 'FRA', 'SAH': 'SPR', 'MRT': 'FRA',
    'MLI': 'FRA', 'NER': 'FRA', 'TCD': 'FRA', 'SEN': 'FRA', 'GMB': 'ENG', 'GIN': 'FRA',
    'GNB': 'POR', 'SLE': 'ENG', 'LBR': 'LIB', 'CIV': 'FRA', 'BFA': 'FRA', 'GHA': 'ENG',
    'TGO': 'FRA', 'BEN': 'FRA', 'NGA': 'ENG', 'CMR': 'FRA', 'CAF': 'FRA', 'GAB': 'FRA',
    'COG': 'FRA', 'GNQ': 'SPR', 'COD': 'BEL', 'RWA': 'BEL', 'UGA': 'ENG', 'KEN': 'ENG',
    'TZA': 'ENG', 'SDN': 'ENG', 'ETH': 'ETH', 'ERI': 'ITA', 'SOM': 'ITA', 'SOL': 'ENG',
    'DJI': 'FRA', 'AGO': 'POR', 'MOZ': 'POR', 'ZMB': 'ENG', 'ZWE': 'ENG', 'MWI': 'ENG',
    'BWA': 'ENG', 'NAM': 'SAF', 'ZAF': 'SAF', 'MDG': 'FRA', 'CPV': 'POR',
    # Asia
    'IND': 'RAJ', 'PAK': 'RAJ', 'BGD': 'RAJ', 'BTN': 'RAJ', 'MMR': 'ENG', 'LKA': 'ENG',
    'NPL': 'NEP', 'CHN': 'CHI', 'MNG': 'MON', 'JPN': 'JAP', 'KOR': 'JAP', 'TWN': 'JAP',
    'VNM': 'FRA', 'LAO': 'FRA', 'KHM': 'FRA', 'THA': 'SIA', 'MYS': 'ENG', 'IDN': 'HOL',
    'PHL': 'PHI', 'PNG': 'AST', 'TLS': 'POR',
    # Oceania
    'AUS': 'AST', 'NZL': 'NZL', 'FJI': 'ENG', 'NCL': 'FRA', 'SLB': 'ENG', 'VUT': 'ENG',
    # Americas
    'CAN': 'CAN', 'USA': 'USA', 'MEX': 'MEX', 'GTM': 'GUA', 'HND': 'HON', 'SLV': 'ELS',
    'NIC': 'NIC', 'CRI': 'COS', 'PAN': 'PAN', 'BLZ': 'ENG', 'CUB': 'CUB', 'HTI': 'HAI',
    'DOM': 'DOM', 'JAM': 'ENG', 'PRI': 'USA', 'BHS': 'ENG', 'TTO': 'ENG',
    'COL': 'COL', 'VEN': 'VEN', 'GUY': 'ENG', 'SUR': 'HOL', 'ECU': 'ECU', 'PER': 'PRU',
    'BOL': 'BOL', 'CHL': 'CHL', 'ARG': 'ARG', 'PRY': 'PAR', 'URY': 'URG', 'BRA': 'BRA',
    'FLK': 'ENG',
}

# (modern adm0, [admin-1 names], owner tag, special tag, group adm0 override or None)
OVERRIDES = [
    ('POL', ['West Pomeranian', 'Lubusz', 'Lower Silesian', 'Opole', 'Warmian-Masurian'], 'GER', 'eastger', None),
    ('POL', ['Pomeranian'], 'POL', 'danzig', None),
    ('RUS', ['Kaliningrad'], 'GER', 'eastger', None),
    ('UKR', ['Volyn', 'Rivne', "L'viv", "Ternopil'", "Ivano-Frankivs'k"], 'POL', 'east', None),
    ('BLR', ['Brest', 'Grodno'], 'POL', 'east', None),
    ('LTU', ['Vilniaus'], 'POL', 'east', None),
    ('LTU', ['Klaipedos'], 'LIT', 'memel', None),
    ('UKR', ['Transcarpathia'], 'CZE', 'ruthenia', None),
    ('UKR', ['Chernivtsi'], 'ROM', 'bess', 'MDA'),
    ('MDA', None, 'ROM', 'bess', None),
    ('CZE', ['Karlovarský', 'Ústecký', 'Liberecký'], 'CZE', 'sudeten', None),
    ('ROU', ['Satu Mare', 'Maramures', 'Salaj', 'Bihor', 'Cluj', 'Bistrita-Nasaud', 'Mures',
             'Harghita', 'Covasna'], 'ROM', 'ntrans', None),
    ('BGR', ['Dobrich', 'Silistra'], 'ROM', 'sdob', None),
    ('HRV', ['Istarska'], 'ITA', 'istria', None),
    ('FRA', ['Bas-Rhin', 'Haute-Rhin', 'Haut-Rhin', 'Moselle'], 'FRA', 'alsace', None),
    ('TUR', ['Hatay'], 'FRA', '', 'SYR'),
    ('YEM', ['Hadramawt', 'Al Mahrah', 'Lahij', '`Adan', 'Abyan', 'Shabwah', "Al Dali'"], 'ENG', 'aden', None),
    ('MAR', ['Tanger - Tétouan', 'Taza - Al Hoceima - Taounate'], 'SPR', 'nat', None),
    ('MAR', ['Laâyoune - Boujdour - Sakia El Hamra', 'Oued el Dahab'], 'SPR', 'nat', 'SAH'),
    ('SAH', None, 'SPR', 'nat', None),
    ('GNQ', None, 'SPR', 'nat', None),
    # Spanish civil war: nationalist start zone
    ('ESP', ['La Coruña', 'Lugo', 'Orense', 'Pontevedra', 'León', 'Zamora', 'Salamanca', 'Valladolid',
             'Palencia', 'Burgos', 'Soria', 'Segovia', 'Ávila', 'Navarra', 'Álava', 'La Rioja',
             'Zaragoza', 'Huesca', 'Teruel', 'Cáceres', 'Cádiz', 'Sevilla', 'Córdoba', 'Granada', 'Huelva',
             'Baleares', 'Santa Cruz de Tenerife', 'Las Palmas', 'Ceuta', 'Melilla'], 'SPR', 'nat', None),
    # China
    ('CHN', ['Heilongjiang', 'Jilin', 'Liaoning'], 'MAN', '', None),
    ('CHN', ['Xinjiang'], 'SIK', '', None),
    ('CHN', ['Xizang'], 'TIB', '', None),
    ('CHN', ['Gansu', 'Ningxia', 'Qinghai'], 'XSM', '', None),
    ('CHN', ['Shanxi'], 'SHX', '', None),
    ('CHN', ['Guangxi'], 'GXC', '', None),
    ('CHN', ['Yunnan'], 'YUN', '', None),
]

# Polygon clips: (adm0, admin-1 name, lon/lat polygon, tag, special, group adm0, piece name)
CLIPS = [
    ('RUS', 'Leningrad', [(27.0, 60.0), (29.95, 60.14), (30.25, 60.33), (30.62, 60.52), (31.2, 61.25), (29.4, 61.5), (27.0, 61.0)],
     'FIN', 'karelia', 'FIN', 'Выборг'),
    ('RUS', 'Sakhalin', [(140.0, 44.0), (157.0, 44.0), (157.0, 50.0), (140.0, 50.0)], 'JAP', 'karafuto', 'JPS', 'Карафуто'),
    ('CHN', 'Inner Mongol', [(116.3, 38.0), (128.0, 38.0), (128.0, 54.0), (116.3, 54.0)], 'MAN', '', 'CHN', None),
    ('CHN', 'Shaanxi', [(104.0, 35.55), (112.0, 35.55), (112.0, 40.0), (104.0, 40.0)], 'PRC', '', 'CHN', 'Яньань'),
    ('GRC', 'Notio Aigaio', [(26.25, 35.0), (29.0, 35.0), (29.0, 37.6), (26.25, 37.6)], 'ITA', 'dodec', 'DOD', 'Родос'),
]

# Synthetic circular regions: (lon, lat, radius deg, tag, name, key, carve_from_land)
CIRCLES = [
    (-5.35, 36.14, 0.24, 'ENG', 'Гибралтар', 'gibraltar', True),
    (103.82, 1.33, 0.27, 'ENG', 'Сингапур', 'singapore', True),
    (114.15, 22.32, 0.27, 'ENG', 'Гонконг', 'hongkong', True),
    (14.42, 35.9, 0.33, 'ENG', 'Мальта', 'malta', False),
    (-177.37, 28.2, 0.55, 'USA', 'Мидуэй', 'midway', False),
    (166.63, 19.3, 0.5, 'USA', 'Уэйк', 'wake', False),
    (144.75, 13.45, 0.5, 'USA', 'Гуам', 'guam', False),
    (145.75, 15.75, 0.5, 'JAP', 'Сайпан', 'saipan', False),
    (151.8, 7.4, 0.55, 'JAP', 'Трук', 'truk', False),
    (167.7, 8.7, 0.55, 'JAP', 'Кваджалейн', 'kwajalein', False),
    (134.5, 7.4, 0.5, 'JAP', 'Палау', 'palau', False),
    (141.3, 24.8, 0.5, 'JAP', 'Иводзима', 'iwojima', False),
    (127.9, 26.45, 0.55, 'JAP', 'Окинава', 'okinawa', False),
    (173.0, 1.4, 0.5, 'ENG', 'Тарава', 'tarawa', False),
    (-27.2, 38.6, 0.6, 'POR', 'Азорские острова', 'azores', False),
    (-64.75, 32.3, 0.5, 'ENG', 'Бермуды', 'bermuda', False),
]
# admin-1 units removed because a circle replaces them
DROP_UNITS = [('JPN', 'Okinawa'), ('PRT', 'Azores'), ('PRT', 'Madeira')]

# Number of regions per group "TAG|ADM0|special" (special may be omitted)
K = {
    'GER|DEU': 10, 'GER|POL|eastger': 4, 'GER|RUS|eastger': 1,
    'POL|POL': 7, 'POL|POL|danzig': 1, 'POL|UKR|east': 2, 'POL|BLR|east': 2, 'POL|LTU|east': 1,
    'FRA|FRA': 15, 'FRA|FRA|alsace': 1, 'ENG|GBR': 9, 'IRE|IRL': 2,
    'ITA|ITA': 11, 'ITA|HRV|istria': 1, 'SPR|ESP': 5, 'SPR|ESP|nat': 6, 'POR|PRT': 2,
    'HOL|NLD': 2, 'BEL|BEL': 2, 'LUX|LUX': 1, 'SWI|CHE': 2, 'AUS|AUT': 3,
    'CZE|CZE': 3, 'CZE|CZE|sudeten': 1, 'CZE|SVK': 2, 'CZE|UKR|ruthenia': 1,
    'HUN|HUN': 3, 'ROM|ROU': 5, 'ROM|ROU|ntrans': 2, 'ROM|MDA|bess': 2, 'ROM|BGR|sdob': 1,
    'YUG|SRB': 3, 'YUG|HRV': 2, 'YUG|BIH': 2, 'YUG|SVN': 1, 'YUG|MNE': 1, 'YUG|MKD': 1,
    'BUL|BGR': 3, 'GRE|GRC': 5, 'ALB|ALB': 1, 'TUR|TUR': 9,
    'DEN|DNK': 2, 'DEN|ISL': 1, 'DEN|GRL': 1, 'NOR|NOR': 5, 'SWE|SWE': 6, 'FIN|FIN': 5,
    'EST|EST': 1, 'LAT|LVA': 2, 'LIT|LTU': 2, 'LIT|LTU|memel': 1, 'ENG|CYP': 1,
    'SOV|RUS': 54, 'SOV|UKR': 10, 'SOV|BLR': 4, 'SOV|GEO': 1, 'SOV|ARM': 1, 'SOV|AZE': 1,
    'SOV|KAZ': 6, 'SOV|UZB': 2, 'SOV|TKM': 2, 'SOV|KGZ': 1, 'SOV|TJK': 1,
    'PER|IRN': 6, 'IRQ|IRQ': 3, 'SAU|SAU': 4, 'YEM|YEM': 1, 'ENG|YEM|aden': 1, 'ENG|OMN': 1,
    'ENG|ARE': 1, 'ENG|KWT': 1, 'ENG|ISR': 1, 'ENG|JOR': 1, 'FRA|SYR': 2, 'FRA|LBN': 1,
    'AFG|AFG': 3, 'EGY|EGY': 4,
    'ITA|LBY': 4, 'FRA|TUN': 2, 'FRA|DZA': 5, 'FRA|MAR': 3, 'SPR|MAR|nat': 1, 'SPR|SAH|nat': 1,
    'FRA|MRT': 2, 'FRA|MLI': 3, 'FRA|NER': 2, 'FRA|TCD': 3, 'FRA|SEN': 1, 'ENG|GMB': 1,
    'FRA|GIN': 1, 'POR|GNB': 1, 'ENG|SLE': 1, 'LIB|LBR': 1, 'FRA|CIV': 1, 'FRA|BFA': 1,
    'ENG|GHA': 1, 'FRA|TGO': 1, 'FRA|BEN': 1, 'ENG|NGA': 4, 'FRA|CMR': 2, 'FRA|CAF': 2,
    'FRA|GAB': 1, 'FRA|COG': 1, 'SPR|GNQ|nat': 1, 'BEL|COD': 5, 'BEL|RWA': 1, 'ENG|UGA': 1,
    'ENG|KEN': 2, 'ENG|TZA': 3, 'ENG|SDN': 5, 'ETH|ETH': 4, 'ITA|ERI': 1, 'ITA|SOM': 2,
    'ENG|SOL': 1, 'FRA|DJI': 1, 'POR|AGO': 3, 'POR|MOZ': 3, 'ENG|ZMB': 2, 'ENG|ZWE': 1,
    'ENG|MWI': 1, 'ENG|BWA': 2, 'SAF|NAM': 2, 'SAF|ZAF': 5, 'FRA|MDG': 2, 'POR|CPV': 1,
    'RAJ|IND': 15, 'RAJ|PAK': 4, 'RAJ|BGD': 1, 'RAJ|BTN': 1, 'ENG|MMR': 3, 'ENG|LKA': 1,
    'NEP|NPL': 1, 'CHI|CHN': 19, 'MAN|CHN': 5, 'SIK|CHN': 3, 'TIB|CHN': 2, 'XSM|CHN': 3,
    'SHX|CHN': 1, 'GXC|CHN': 1, 'YUN|CHN': 1, 'PRC|CHN': 1,
    'MON|MNG': 3, 'JAP|JPN': 8, 'JAP|KOR': 3, 'JAP|TWN': 1, 'JAP|JPS|karafuto': 1,
    'FRA|VNM': 3, 'FRA|LAO': 1, 'FRA|KHM': 1, 'SIA|THA': 3, 'ENG|MYS': 3, 'HOL|IDN': 10,
    'PHI|PHL': 4, 'AST|PNG': 3, 'POR|TLS': 1,
    'AST|AUS': 10, 'NZL|NZL': 2, 'ENG|FJI': 1, 'FRA|NCL': 1, 'ENG|SLB': 1, 'ENG|VUT': 1,
    'CAN|CAN': 14, 'USA|USA': 30, 'MEX|MEX': 6, 'GUA|GTM': 1, 'HON|HND': 1, 'ELS|SLV': 1,
    'NIC|NIC': 1, 'COS|CRI': 1, 'PAN|PAN': 1, 'ENG|BLZ': 1, 'CUB|CUB': 2, 'HAI|HTI': 1,
    'DOM|DOM': 1, 'ENG|JAM': 1, 'USA|PRI': 1, 'ENG|BHS': 1, 'ENG|TTO': 1,
    'COL|COL': 3, 'VEN|VEN': 3, 'ENG|GUY': 1, 'HOL|SUR': 1, 'ECU|ECU': 1, 'PRU|PER': 3,
    'BOL|BOL': 2, 'CHL|CHL': 4, 'ARG|ARG': 7, 'PAR|PRY': 1, 'URG|URY': 1, 'BRA|BRA': 12,
    'ENG|FLK': 1, 'ITA|DOD|dodec': 1, 'FIN|FIN|karelia': 1,
}

# per-group clustering params
PARAMS = {
    'PHI|PHL': dict(sep=60000, link=4.0),
    'HOL|IDN': dict(sep=100000, link=6.0),
    'AST|PNG': dict(sep=30000, link=5.0),
    'ENG|SLB': dict(sep=1e12, link=12.0),
    'ENG|BHS': dict(sep=1e12, link=8.0),
    'ENG|FJI': dict(sep=1e12, link=8.0),
    'ENG|VUT': dict(sep=1e12, link=8.0),
    'FRA|NCL': dict(sep=1e12, link=8.0),
    'POR|CPV': dict(sep=1e12, link=8.0),
    'GRE|GRC': dict(sep=8000, link=3.0),
    'ENG|GBR': dict(sep=12000, link=4.0),
    'DEN|GRL': dict(sep=1e12, link=30.0),
    'ENG|MYS': dict(sep=50000, link=4.0),
    'NOR|NOR': dict(sep=1e12, link=6.0),
    'CAN|CAN': dict(sep=200000, link=8.0),
    'CHL|CHL': dict(sep=1e12, link=6.0),
    'ENG|FLK': dict(sep=1e12, link=8.0),
    'ITA|DOD|dodec': dict(sep=1e12, link=8.0),
    'JAP|JPS|karafuto': dict(sep=1e12, link=20.0),
    'EST|EST': dict(sep=1e12, link=5.0),
    'USA|USA': dict(sep=20000, link=3.0),
    'ENG|TTO': dict(sep=1e12, link=5.0),
    'SPR|ESP|nat': dict(sep=4500, link=3.0),
}
UNIT_NAMES = {'USA', 'CAN', 'AUS', 'CHN', 'IND', 'BRA', 'MEX', 'DEU', 'ARG', 'PAK', 'ZAF', 'SAU', 'IRN', 'VEN', 'COL'}
KEEP_SMALL = {'ITA|HRV|istria', 'LUX|LUX', 'ENG|TTO', 'ENG|CYP', 'POR|CPV', 'ENG|FLK', 'ITA|DOD|dodec', 'USA|PRI'}

# Split very large admin-1 units into pieces of roughly this size (km2)
SPLIT_OVER = 880000
SPLIT_PIECE = 620000

# City renames for the 1936 setting (Russian names)
RENAME = {
    'Санкт-Петербург': 'Ленинград', 'Волгоград': 'Сталинград', 'Екатеринбург': 'Свердловск',
    'Нижний Новгород': 'Горький', 'Самара': 'Куйбышев', 'Тверь': 'Калинин', 'Донецк': 'Сталино',
    'Пермь': 'Молотов', 'Калининград': 'Кёнигсберг', 'Вроцлав': 'Бреслау', 'Щецин': 'Штеттин',
    'Гданьск': 'Данциг', 'Вильнюс': 'Вильно', 'Хошимин': 'Сайгон', 'Мумбаи': 'Бомбей',
    'Ченнаи': 'Мадрас', 'Колката': 'Калькутта', 'Джакарта': 'Батавия', 'Янгон': 'Рангун',
    'Киншаса': 'Леопольдвиль', 'Хараре': 'Солсбери', 'Мапуту': 'Лоренсу-Маркиш',
    'Чанчунь': 'Синьцзин', 'Шэньян': 'Мукден', 'Бишкек': 'Фрунзе', 'Душанбе': 'Сталинабад',
    'Владикавказ': 'Орджоникидзе', 'Луганск': 'Ворошиловград', 'Днепр': 'Днепропетровск',
    'Астана': 'Акмолинск', 'Нур-Султан': 'Акмолинск', 'Алматы': 'Алма-Ата', 'Ольштын': 'Алленштайн',
    'Ополе': 'Оппельн', 'Зелёна-Гура': 'Грюнберг', 'Клайпеда': 'Мемель', 'Братислава': 'Братислава',
    'Ужгород': 'Ужгород', 'Кишинёв': 'Кишинёв', 'Пекин': 'Бэйпин', 'Тайбэй': 'Тайхоку',
    'Сеул': 'Кэйдзё', 'Пхеньян': 'Хэйдзё', 'Хошимин (город)': 'Сайгон', 'Лубумбаши': 'Элизабетвиль',
    'Кочи': 'Кочин', 'Бангалор': 'Бангалор', 'Макасар': 'Макассар', 'Южно-Сахалинск': 'Тоёхара',
    'Уссурийск': 'Ворошилов', 'Вятка': 'Киров', 'Ижевск': 'Ижевск', 'Оренбург': 'Оренбург',
    'Гянджа': 'Кировабад', 'Харбин': 'Харбин', 'Подгорица': 'Цетине', 'Кёнигсберг': 'Кёнигсберг',
    'Шымкент': 'Чимкент', 'Актобе': 'Актюбинск', 'Алма-Ата': 'Алма-Ата', 'Усть-Каменогорск': 'Усть-Каменогорск',
    'Караганды': 'Караганда', 'Атырау': 'Гурьев', 'Актау': 'Форт-Шевченко', 'Тольятти': 'Ставрополь-на-Волге',
    'Набережные Челны': 'Казань', 'Кропивницкий': 'Кирово', 'Хмельницкий': 'Проскуров',
    'Ивано-Франковск': 'Станислав', 'Каракас': 'Каракас', 'Стамбул': 'Стамбул',
    'Котабато': 'Давао', 'Порт-Морсби': 'Порт-Морсби', 'Виндхук': 'Виндхук',
    'Нью-Дели': 'Дели', 'Мьичина': 'Мандалай',
}

# Sea zone seeds: (name, lon, lat)
SEAS = [
    ('Северное море', 3.0, 56.5), ('Норвежское море', 3.0, 67.0), ('Баренцево море', 38.0, 72.5),
    ('Балтийское море', 19.2, 56.5), ('Ботнический залив', 20.0, 62.0), ('Ла-Манш', -2.0, 50.0),
    ('Западные подходы', -11.5, 51.0), ('Бискайский залив', -5.0, 45.5), ('Воды Исландии', -24.0, 62.0),
    ('Северная Атлантика', -35.0, 52.0), ('Море Лабрадор', -53.0, 58.0), ('Ньюфаундлендская банка', -50.0, 43.0),
    ('Восточное побережье США', -70.0, 36.0), ('Саргассово море', -48.0, 29.0), ('Азорские воды', -27.0, 40.5),
    ('Португальское побережье', -11.5, 39.0), ('Канарские воды', -19.0, 28.5), ('Мексиканский залив', -90.0, 25.0),
    ('Карибское море', -75.0, 15.0), ('Экваториальная Атлантика', -28.0, 4.0), ('Гвинейский залив', 2.0, 1.0),
    ('Воды Зелёного Мыса', -22.0, 13.0), ('Побережье Бразилии', -32.0, -12.0), ('Южная Атлантика', -10.0, -27.0),
    ('Аргентинское море', -52.0, -42.0), ('Побережье Анголы', 8.0, -17.0), ('Мыс Доброй Надежды', 18.0, -38.0),
    ('Западное Средиземноморье', 4.5, 39.3), ('Тирренское море', 12.0, 39.6), ('Центральное Средиземноморье', 17.5, 34.8),
    ('Адриатическое море', 15.5, 43.0), ('Эгейское море', 25.0, 37.8), ('Восточное Средиземноморье', 31.0, 33.5),
    ('Чёрное море', 34.0, 43.3), ('Каспийское море', 50.5, 41.5), ('Красное море', 38.0, 20.0),
    ('Аденский залив', 48.0, 12.5), ('Аравийское море', 64.0, 17.0), ('Персидский залив', 51.5, 27.0),
    ('Мозамбикский пролив', 41.0, -18.0), ('Побережье Восточной Африки', 50.0, -3.0), ('Маскаренские воды', 62.0, -25.0),
    ('Лаккадивское море', 75.0, 6.0), ('Бенгальский залив', 89.0, 14.0), ('Андаманское море', 96.0, 9.0),
    ('Центральный Индийский океан', 80.0, -14.0), ('Восточный Индийский океан', 103.0, -22.0),
    ('Южный Индийский океан', 75.0, -42.0),
    ('Южно-Китайское море', 114.0, 14.0), ('Сиамский залив', 102.0, 9.5), ('Яванское море', 112.0, -5.0),
    ('Море Банда', 129.0, -7.5), ('Море Сулавеси', 123.0, 3.5), ('Филиппинское море', 132.0, 17.0),
    ('Восточно-Китайское море', 125.0, 29.0), ('Жёлтое море', 123.0, 36.5), ('Японское море', 135.0, 40.0),
    ('Охотское море', 149.0, 54.0), ('Побережье Японии', 145.0, 33.0), ('Берингово море', 178.0, 58.0),
    ('Курильские воды', 162.0, 43.0), ('Марианские воды', 148.0, 17.0), ('Каролинские воды', 152.0, 4.0),
    ('Маршалловы воды', 170.0, 11.0), ('Коралловое море', 156.0, -16.0), ('Море Бисмарка', 148.0, -3.5),
    ('Тасманово море', 160.0, -37.0), ('Большой Австралийский залив', 130.0, -37.0),
    ('Воды Фиджи', 177.0, -19.0), ('Воды Мидуэя', -176.0, 30.0), ('Гавайские воды', -157.0, 21.0),
    ('Залив Аляска', -146.0, 55.0), ('Западное побережье США', -128.0, 38.0), ('Побережье Мексики', -108.0, 16.0),
    ('Панамский залив', -85.0, 4.0), ('Побережье Перу', -84.0, -13.0), ('Побережье Чили', -79.0, -38.0),
    ('Южная часть Тихого океана', -125.0, -32.0), ('Полинезия', -148.0, -10.0),
    ('Северная часть Тихого океана', -158.0, 41.0), ('Гудзонов залив', -85.0, 59.5),
    ('Карское море', 68.0, 73.5), ('Море Лаптевых', 125.0, 74.0), ('Чукотское море', 172.0, 71.5),
    ('Море Бофорта', -140.0, 71.5), ('Море Баффина', -64.0, 71.5),
]
# Manual sea adjacency through narrow straits / canals: (zoneA, zoneB, controlling point lon/lat or None)
SEA_LINKS = [
    ('Чёрное море', 'Эгейское море', (29.0, 41.0)),           # Bosphorus / Dardanelles
    ('Западное Средиземноморье', 'Португальское побережье', (-5.35, 36.14)),  # Gibraltar
    ('Балтийское море', 'Северное море', (10.5, 56.0)),        # Danish straits
    ('Восточное Средиземноморье', 'Красное море', (32.4, 30.5)),  # Suez
    ('Карибское море', 'Панамский залив', (-79.7, 9.1)),       # Panama
    ('Красное море', 'Аденский залив', None),
    ('Персидский залив', 'Аравийское море', None),
    ('Ла-Манш', 'Северное море', None),
    ('Андаманское море', 'Южно-Китайское море', (103.82, 1.33)),  # Malacca / Singapore
    ('Балтийское море', 'Ботнический залив', None),
    ('Тирренское море', 'Центральное Средиземноморье', None),
    ('Адриатическое море', 'Центральное Средиземноморье', None),
    ('Японское море', 'Восточно-Китайское море', None),
    ('Японское море', 'Охотское море', None),
    ('Яванское море', 'Восточный Индийский океан', None),
    ('Яванское море', 'Южно-Китайское море', None),
    ('Море Банда', 'Коралловое море', None),
]
# Land crossings over narrow straits: pairs of lon/lat points lying inside the two regions
LAND_STRAITS = [
    ((14.3, 37.6), (16.3, 39.1)),     # Sicily - Calabria
    ((11.9, 55.5), (9.4, 56.0)),      # Zealand - Jutland
    ((132.5, 34.6), (130.9, 33.4)),   # Honshu - Kyushu
    ((133.9, 34.8), (133.6, 33.8)),   # Honshu - Shikoku
    ((140.9, 40.6), (141.4, 43.0)),   # Honshu - Hokkaido
    ((34.6, 45.3), (38.6, 45.2)),     # Crimea - Kuban
]

# Final manual renames: 'TAG:auto name' or 'auto name' -> name
NAME_FIX = {
    'USA:Вашингтон': 'Сиэтл', 'USA:Мэриленд': 'Вашингтон', 'USA:Бетел': 'Ном',
    'Ханты-Мансийский автономный округ — Югра': 'Ханты-Мансийск', 'Чукотский автономный округ': 'Чукотка',
    'Магаданская область': 'Магадан', 'Камчатский край': 'Камчатка', 'Сахалинская область': 'Сахалин',
    'Иркутская область': 'Иркутск', 'Красноярский край (север)': 'Таймыр', 'SOV:Ногинск': 'Эвенкия',
    'SOV:Находка': 'Салехард', 'Кепулауан-Риау': 'Риау', 'Аппер-Демерара-Бербис': 'Джорджтаун',
    'Брикама': 'Батерст', 'Джафна': 'Цейлон', 'Ей': 'Джуба', 'Гаутенг': 'Йоханнесбург', 'Тхимпху': 'Бутан',
    'CHI:Пекин': 'Бэйпин', 'GER:Саарбрюккен': 'Рейнланд', 'Северный Рейн-Вестфалия': 'Рур', 'GER:Бремен': 'Ганновер',
    'MAN:Внутренняя Монголия': 'Хинган', 'CHI:Внутренняя Монголия': 'Суйюань', 'Хайкоу': 'Хайнань',
    'Нуук': 'Гренландия', 'Рейкьявик': 'Исландия', 'Северо-Западные территории (запад)': 'Инувик',
    'Северо-Западные территории (юг)': 'Йеллоунайф', 'Арава': 'Рабаул', 'Маданг': 'Новая Гвинея',
    'Лас-Пальмас-де-Гран-Канария': 'Канарские острова', 'SPR:Пальма': 'Балеарские острова',
    'Бата': 'Испанская Гвинея', 'Эль-Аюн': 'Испанская Сахара', 'SPR:Танжер': 'Испанское Марокко',
    'Прая': 'Острова Зелёного Мыса', 'Сан-Хуан': 'Пуэрто-Рико', 'Нассау': 'Багамы', 'Сува': 'Фиджи',
    'Нумеа': 'Новая Каледония', 'Хониара': 'Гуадалканал', 'Порт-Вила': 'Новые Гебриды', 'Никосия': 'Кипр',
    'Аяччо': 'Корсика', 'Ираклион': 'Крит', 'Кальяри': 'Сардиния', 'Палермо': 'Сицилия', 'Тайхоку': 'Формоза',
    'ENG:Кингстон': 'Ямайка', 'Порт-оф-Спейн': 'Тринидад', 'PHI:Давао': 'Минданао', 'Баколод': 'Висайи',
    'Крайстчерч': 'Южный остров', 'NZL:Окленд': 'Северный остров', 'Дубай': 'Договорный Оман', 'Доха': 'Катар',
    'Тель-Авив': 'Палестина', 'Амман': 'Трансиордания', 'Эль-Кувейт': 'Кувейт', 'Асмэра': 'Эритрея',
    'Харгейса': 'Британское Сомали', 'Пула': 'Истрия', 'Сайду-Шариф': 'Пешавар',
    'Тибетский автономный район (запад)': 'Западный Тибет', 'Нинся-Хуэйский автономный район': 'Нинся',
    'Гуанси-Чжуанский автономный район': 'Гуанси', 'Андаманские и Никобарские острова': 'Андаманские острова',
    'Якутия (запад)': 'Мирный', 'Якутия (восток)': 'Колыма', 'Онтарио (север)': 'Северное Онтарио',
    'Фолклендские острова': 'Фолкленды', 'Галапагос': 'Галапагосы', 'Маскат': 'Оман',
}
