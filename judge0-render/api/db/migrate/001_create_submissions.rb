class CreateSubmissions < ActiveRecord::Migration[7.0]
  def change
    create_table :submissions do |t|
      t.text :source_code, null: false
      t.integer :language_id, null: false
      t.text :stdin, default: ''
      t.text :expected_output, default: ''
      t.text :stdout, default: ''
      t.text :stderr, default: ''
      t.text :compile_output, default: ''
      t.text :message, default: ''
      t.decimal :time, precision: 10, scale: 3
      t.integer :memory
      t.string :status, default: 'In Queue'
      
      t.timestamps
    end
    
    add_index :submissions, :status
    add_index :submissions, :created_at
    add_index :submissions, :language_id
  end
end
