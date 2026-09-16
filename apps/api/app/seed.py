from sqlalchemy import select
from app.models.user import User
from app.core.security import hash_password
from app.domains.audit.service import record


def seed_demo(db, password):
    if len(password) < 12:
        raise ValueError('Development seed password must contain at least 12 characters')
    for username, name, role in [('manager','Mwansa Banda','MANAGER'), ('cashier','Chipo Phiri','CASHIER'),
                                 ('server','Tendai Zulu','SERVER'), ('owner','Dennis','OWNER_ADMIN')]:
        if not db.scalar(select(User).where(User.username == username)):
            user = User(username=username, name=name, role=role, password_hash=hash_password(password))
            db.add(user)
            db.flush()
            record(db, None, 'USER_CREATED', 'user', user.id, {'username': username, 'role': role, 'source': 'explicit_dev_seed'})
    seed_catalog(db)


def seed_catalog(db):
    from decimal import Decimal
    from app.models.catalog import Category, Product, Variant, ModifierGroup, Modifier, RecipeComponent
    from app.models.inventory import InventoryItem, StockMovement
    if db.get(Category, 'ice-cream'):
        return
    db.add(Category(id='ice-cream', name='Ice cream'))
    db.add_all([ModifierGroup(id='serving', name='Serving', minimum=1, maximum=1),
                ModifierGroup(id='topping', name='Toppings', minimum=0, maximum=3)])
    items = [('vanilla-stock','Vanilla ice cream','ml',20000,2000),('chocolate-stock','Chocolate ice cream','ml',15000,2000),
             ('strawberry-stock','Strawberry ice cream','ml',12000,2000),('cones','Waffle cones','piece',200,30),
             ('cups','Paper cups','piece',200,30),('oreo-stock','Oreo crumb','g',3000,300),
             ('sprinkles-stock','Rainbow sprinkles','g',2500,250),('sauce-stock','Chocolate sauce','ml',3000,300),
             ('napkins','Napkins','piece',500,50)]
    for key, name, unit, quantity, threshold in items:
        db.add(InventoryItem(id=key,name=name,unit=unit,low_stock_threshold=Decimal(threshold)))
    db.flush()
    for key, name, unit, quantity, threshold in items:
        db.add(StockMovement(item_id=key,type='RECEIPT',quantity=Decimal(quantity),reference='dev-seed',reason='Explicit development opening stock'))
    for key, name, color, description in [('vanilla','Vanilla','#F6E4AB','Classic, creamy & always a favourite'),
                                         ('chocolate','Chocolate','#AD7659','Rich cocoa with a velvety finish'),
                                         ('strawberry','Strawberry','#EDB1BD','A little fruity, a little dreamy')]:
        db.add(Product(id=key,category_id='ice-cream',name=name,color=color,description=description))
        db.flush()
        for size, title, price, quantity in [('single','Single scoop',2200,80),('double','Double scoop',3200,160)]:
            variant_id = f'{key}-{size}'
            db.add(Variant(id=variant_id,product_id=key,name=title,price_ngwee=price))
            db.flush()
            db.add_all([RecipeComponent(variant_id=variant_id,item_id=f'{key}-stock',quantity=Decimal(quantity)),
                        RecipeComponent(variant_id=variant_id,item_id='napkins',quantity=Decimal(1))])
    for key, name, group, price, item, quantity in [('cone','Waffle cone','serving',500,'cones',1),
          ('cup','Paper cup','serving',0,'cups',1),('oreo','Oreo crumble','topping',500,'oreo-stock',20),
          ('sprinkles','Rainbow sprinkles','topping',300,'sprinkles-stock',10),
          ('chocolate-sauce','Chocolate sauce','topping',400,'sauce-stock',15)]:
        db.add(Modifier(id=key,name=name,group_id=group,price_ngwee=price))
        db.flush()
        db.add(RecipeComponent(modifier_id=key,item_id=item,quantity=Decimal(quantity)))
    record(db, None, 'CATALOG_SEEDED', 'catalog', 'dev-seed', {'opening_stock': True})
