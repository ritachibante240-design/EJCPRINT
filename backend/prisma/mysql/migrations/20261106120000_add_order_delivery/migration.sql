-- Forma e formato de entrega dos serviços digitais (Digitalização e Digitação).
-- Colunas opcionais: pedidos antigos e versões antigas da app continuam a funcionar.
ALTER TABLE `Order`
  ADD COLUMN `deliveryFormat` VARCHAR(20) NULL,
  ADD COLUMN `deliveryMethod` VARCHAR(20) NULL;
