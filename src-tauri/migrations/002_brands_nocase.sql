-- Marcas sin distinguir mayúsculas: "creality" y "Creality" son la misma marca.
CREATE UNIQUE INDEX ux_brands_name_nocase ON brands(name COLLATE NOCASE);
