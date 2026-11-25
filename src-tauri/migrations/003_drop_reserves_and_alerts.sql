-- Sin reservas ni aviso de stock bajo: los gramos se registran solo al completar o fallar.
ALTER TABLE filaments DROP COLUMN low_stock_threshold_g;
ALTER TABLE print_filaments DROP COLUMN grams_estimated;
